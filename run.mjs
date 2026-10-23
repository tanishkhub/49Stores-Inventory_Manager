#!/usr/bin/env node
// One-command local runner: preflight -> config -> deps -> MongoDB -> seed -> launch server + client.
// Usage: node run.mjs [--check] [--demo] [--no-seed] [--no-install] [--start-mongo] [--no-color] [--ascii]
// Exit codes: 0 ok, 1 fatal check failed, 2 bad arguments. Full logs/tracebacks: run.log
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  UsageError, classifyMongoError, depsHash, exitCodeFor, fillEnvTemplate, findFreePort, helpText, isLocalHost,
  isSecretKey, makeTheme, maskMongoUri, maskSecret, parseArgs, parseEnvFile, parseMongoUri, renderErrorBox,
  renderSummary, stripAnsi, versionAtLeast,
} from './scripts/runner/lib.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(ROOT, 'server');
const CLIENT = path.join(ROOT, 'client');
const LOG = path.join(ROOT, 'run.log');
const MIN_NODE = '22.0.0';
const MONGO_CONTAINER = 'inventory-poc-mongo';
const DEFAULT_ADMIN_PASSWORD = 'Admin@12345';
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

let opts;
try {
  opts = parseArgs(process.argv.slice(2));
} catch (err) {
  if (err instanceof UsageError) {
    console.error(`${err.message}\n\n${helpText()}`);
    process.exit(2);
  }
  throw err;
}
if (opts.help) {
  console.log(helpText());
  process.exit(0);
}

const theme = makeTheme({
  color: !opts.noColor && !process.env.NO_COLOR && process.stdout.isTTY,
  unicode: !opts.ascii && process.env.TERM !== 'dumb' && (!isWin || Boolean(process.env.WT_SESSION)),
});
const rows = [];

writeFileSync(LOG, `# run.mjs ${new Date().toISOString()} args=${process.argv.slice(2).join(' ')}\n`);
const log = (msg) => appendFileSync(LOG, `${stripAnsi(msg)}\n`);
const say = (msg = '') => { console.log(msg); log(msg); };
const record = (name, status, detail = '') => {
  rows.push({ name, status, detail });
  say(`${theme.badge(status)} ${name}${detail ? ` - ${detail}` : ''}`);
};
const stage = (title) => say(`\n${theme.paint('bold', `== ${title}`)}`);

class Fatal extends Error {
  constructor(box, cause) { super(box.what); this.box = box; this.cause = cause; }
}

function fail(name, box, cause) {
  record(name, 'FAIL', box.what);
  throw new Fatal({ title: name, ...box }, cause);
}

function finish(code) {
  say(`\n${renderSummary(rows, theme)}`);
  say(`\nFull log: ${path.relative(process.cwd(), LOG) || LOG}`);
  process.exit(code);
}

// ---------- stage 1: preflight ----------
function preflight() {
  stage('Preflight');
  if (!versionAtLeast(process.versions.node, MIN_NODE)) {
    fail('Node.js', {
      what: `Node.js ${process.versions.node} is too old (need >= ${MIN_NODE}).`,
      cause: 'An older Node.js is first on your PATH.',
      fix: 'Install Node.js 22 LTS or newer from https://nodejs.org (or `nvm install 22 && nvm use 22`), then re-run.',
    });
  }
  record('Node.js', 'OK', `v${process.versions.node}`);
  const npm = spawnSync(npmCmd, ['-v'], { encoding: 'utf8', shell: isWin });
  if (npm.status !== 0) {
    fail('npm', {
      what: 'npm was not found on PATH.',
      cause: 'Node.js was installed without npm, or PATH is incomplete.',
      fix: 'Reinstall Node.js from https://nodejs.org (it bundles npm) and open a new terminal.',
    });
  }
  record('npm', 'OK', `v${npm.stdout.trim()}`);
  const docker = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8' });
  const dockerOk = docker.status === 0;
  record('Docker (optional)', dockerOk ? 'OK' : 'SKIP', dockerOk ? `v${docker.stdout.trim()} - can start MongoDB for you` : 'not available; MongoDB must already be running');
  return { dockerOk };
}

// ---------- stage 2: config ----------
function ensureEnv(dir, label, overrides) {
  const envPath = path.join(dir, '.env');
  const examplePath = path.join(dir, '.env.example');
  const rel = path.relative(ROOT, envPath);
  if (existsSync(envPath)) {
    record(`${label} config`, 'OK', `${rel} found`);
    return parseEnvFile(readFileSync(envPath, 'utf8'));
  }
  const template = readFileSync(examplePath, 'utf8');
  if (opts.check) {
    record(`${label} config`, 'WARN', `${rel} missing (run without --check to create it from ${path.basename(examplePath)})`);
    say(theme.paint('dim', template.split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => `    ${l.split('=')[0]}=...`).join('\n')));
    return parseEnvFile(template);
  }
  writeFileSync(envPath, `${fillEnvTemplate(template, overrides)}\n`);
  record(`${label} config`, 'OK', `created ${rel} from .env.example`);
  return parseEnvFile(readFileSync(envPath, 'utf8'));
}

function config() {
  stage('Configuration');
  const serverEnv = ensureEnv(SERVER, 'Server', { JWT_SECRET: randomBytes(32).toString('hex') });
  const clientEnv = ensureEnv(CLIENT, 'Client', {});
  const effective = { ...serverEnv, ...pick(process.env, Object.keys(serverEnv)) };
  for (const [k, v] of Object.entries(effective)) {
    const shown = isSecretKey(k) ? maskSecret(v) : k === 'MONGODB_URI' ? maskMongoUri(v) : v;
    log(`    ${k}=${shown}`);
  }
  if (!effective.JWT_SECRET || effective.JWT_SECRET.startsWith('change-me')) {
    record('JWT_SECRET', 'WARN', 'still the placeholder; set a long random value in server/.env');
  } else {
    record('JWT_SECRET', 'OK', maskSecret(effective.JWT_SECRET));
  }
  return { serverEnv: effective, clientEnv };
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

// ---------- stage 3: dependencies ----------
function installDeps() {
  stage('Dependencies');
  for (const [label, dir] of [['Root', ROOT], ['Server', SERVER], ['Client', CLIENT]]) {
    const read = (f) => (existsSync(path.join(dir, f)) ? readFileSync(path.join(dir, f), 'utf8') : '');
    const hash = depsHash(read('package.json'), read('package-lock.json'));
    const stamp = path.join(dir, 'node_modules', '.runner-deps-hash');
    const current = existsSync(stamp) ? readFileSync(stamp, 'utf8').trim() : null;
    if (current === hash) { record(`${label} packages`, 'OK', 'up to date'); continue; }
    const reason = existsSync(path.join(dir, 'node_modules')) ? 'package files changed' : 'not installed';
    if (opts.check || opts.noInstall) {
      record(`${label} packages`, existsSync(path.join(dir, 'node_modules')) ? 'WARN' : 'SKIP', `${reason}; would run npm install`);
      continue;
    }
    say(`    npm install in ${path.relative(ROOT, dir) || '.'} (${reason})...`);
    const res = spawnSync(npmCmd, ['install', '--no-audit', '--no-fund'], { cwd: dir, encoding: 'utf8', shell: isWin });
    log(res.stdout || ''); log(res.stderr || '');
    if (res.status !== 0) {
      const offline = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNREFUSED/.test(res.stderr || '');
      fail(`${label} packages`, {
        what: `npm install failed in ${path.relative(ROOT, dir) || '.'} (exit ${res.status}).`,
        cause: offline ? 'No network access to the npm registry.' : 'See the npm error output in run.log.',
        fix: offline ? 'Check your internet / proxy (npm config get proxy) and re-run.' : `Run \`npm install\` in ${path.relative(ROOT, dir) || '.'} to see the full error, fix it, then re-run.`,
      });
    }
    writeFileSync(stamp, hash);
    record(`${label} packages`, 'OK', 'installed');
  }
}

function checkImports() {
  const checks = [
    ['Server', SERVER, ['express', 'mongoose', 'bcryptjs', 'jsonwebtoken', 'dotenv', 'cors', 'helmet', 'morgan']],
    ['Client', CLIENT, ['vite', 'react', 'react-dom', 'react-router-dom', '@vitejs/plugin-react', '@tailwindcss/vite']],
  ];
  for (const [label, dir, pkgs] of checks) {
    const findMissing = () => pkgs.filter((p) => !existsSync(path.join(dir, 'node_modules', ...p.split('/'), 'package.json')));
    let missing = findMissing();
    if (missing.length && !opts.check && !opts.noInstall) {
      say(`    ${missing.join(', ')} missing in ${path.basename(dir)}; running npm install...`);
      const res = spawnSync(npmCmd, ['install', '--no-audit', '--no-fund'], { cwd: dir, encoding: 'utf8', shell: isWin });
      log(res.stdout || ''); log(res.stderr || '');
      missing = findMissing();
    }
    if (missing.length === 0) { record(`${label} imports`, 'OK', `${pkgs.length} packages resolve`); continue; }
    const box = {
      what: `${label} is missing: ${missing.join(', ')}`,
      cause: 'Dependencies are not installed or node_modules is incomplete.',
      fix: `Run npm --prefix ${path.basename(dir)} install (or re-run node run.mjs without --no-install / --check).`,
    };
    if (opts.check) { record(`${label} imports`, 'FAIL', box.what); say(renderErrorBox({ title: `${label} imports`, ...box }, theme)); continue; }
    fail(`${label} imports`, box);
  }
}

// ---------- stage 4: MongoDB ----------
function probePort(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const done = (ok) => { sock.destroy(); resolve(ok); };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function askYesNo(question) {
  if (!process.stdin.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [Y/n] `)).trim().toLowerCase();
  rl.close();
  return answer === '' || answer === 'y' || answer === 'yes';
}

function startMongoContainer(port) {
  const exists = spawnSync('docker', ['ps', '-a', '--filter', `name=^${MONGO_CONTAINER}$`, '--format', '{{.Names}}'], { encoding: 'utf8' });
  const args = exists.stdout.trim() === MONGO_CONTAINER
    ? ['start', MONGO_CONTAINER]
    : ['run', '-d', '--name', MONGO_CONTAINER, '-p', `${port}:27017`, '-v', 'inventory-poc-mongo-data:/data/db', 'mongo:7'];
  const res = spawnSync('docker', args, { encoding: 'utf8' });
  log(res.stdout || ''); log(res.stderr || '');
  return res.status === 0 ? null : (res.stderr || '').trim().split('\n').pop();
}

async function mongo({ dockerOk }, serverEnv) {
  stage('MongoDB');
  const uri = serverEnv.MONGODB_URI || 'mongodb://localhost:27017/inventory_poc';
  let parsed;
  try {
    parsed = parseMongoUri(uri);
  } catch (err) {
    fail('MongoDB URI', {
      what: `MONGODB_URI is invalid: ${err.message}`,
      cause: 'Typo in server/.env (or an exported MONGODB_URI variable).',
      fix: 'Set MONGODB_URI=mongodb://localhost:27017/inventory_poc in server/.env.',
    }, err);
  }
  record('MongoDB URI', 'OK', maskMongoUri(uri));

  if (!parsed.srv) {
    let open = await probePort(parsed.host, parsed.port);
    if (!open && isLocalHost(parsed.host) && dockerOk && !opts.check) {
      const go = opts.startMongo || (await askYesNo(`MongoDB is not running on ${parsed.host}:${parsed.port}. Start it in Docker (container ${MONGO_CONTAINER})?`));
      if (go) {
        say(`    starting Docker container ${MONGO_CONTAINER} (mongo:7)...`);
        const err = startMongoContainer(parsed.port);
        if (err) record('MongoDB container', 'WARN', `docker failed: ${err}`);
        for (let i = 0; i < 30 && !open; i += 1) { await sleep(1000); open = await probePort(parsed.host, parsed.port); }
        if (open) record('MongoDB container', 'OK', `${MONGO_CONTAINER} running`);
      }
    }
    if (!open) {
      const fix = isLocalHost(parsed.host)
        ? `Start MongoDB (Windows: Services > MongoDB Server > Start; macOS: brew services start mongodb-community; Linux: sudo systemctl start mongod)${dockerOk ? ', or re-run with --start-mongo to use Docker' : ''}. Check it in MongoDB Compass at mongodb://${parsed.host}:${parsed.port}.`
        : `Check that ${parsed.host}:${parsed.port} is reachable from this machine (VPN/firewall), or point MONGODB_URI at a local MongoDB.`;
      const box = { what: `Nothing is listening on ${parsed.host}:${parsed.port}.`, cause: 'MongoDB is not running / port closed.', fix };
      if (opts.check) { record('MongoDB server', 'FAIL', box.what); say(renderErrorBox({ title: 'MongoDB server', ...box }, theme)); return; }
      fail('MongoDB server', box);
    }
    record('MongoDB port', 'OK', `${parsed.host}:${parsed.port} is open`);
  }

  let mongoose;
  try {
    mongoose = createRequire(path.join(SERVER, 'package.json'))('mongoose');
  } catch {
    record('MongoDB login', 'SKIP', 'mongoose not installed yet');
    return;
  }
  try {
    const conn = await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 5000 }).asPromise();
    await conn.db.command({ ping: 1 });
    await conn.db.listCollections({}, { nameOnly: true }).toArray();
    await conn.close();
    record('MongoDB login', 'OK', `connected to database "${parsed.db || 'test'}"`);
  } catch (err) {
    log(err?.stack || String(err));
    const kind = classifyMongoError(err);
    const boxes = {
      auth: { what: 'MongoDB rejected the credentials.', cause: 'Wrong username/password (or authSource) in MONGODB_URI.', fix: 'Fix the user:password in MONGODB_URI in server/.env, or use mongodb://localhost:27017/inventory_poc for an auth-less local server.' },
      bad_uri: { what: `MongoDB host "${parsed.host}" could not be resolved / URI rejected.`, cause: 'Typo in the MONGODB_URI host or options.', fix: 'Correct MONGODB_URI in server/.env (default mongodb://localhost:27017/inventory_poc).' },
      not_running: { what: `MongoDB at ${parsed.host}:${parsed.port} did not answer.`, cause: 'The port is open but it is not a working MongoDB server (still starting, or another program).', fix: 'Wait a few seconds and re-run; check the server in MongoDB Compass.' },
      other: { what: `MongoDB error: ${err.message}`, cause: 'Unexpected server response.', fix: 'See run.log for the full error and check the server in MongoDB Compass.' },
    };
    if (opts.check) { record('MongoDB login', 'FAIL', boxes[kind].what); say(renderErrorBox({ title: 'MongoDB login', ...boxes[kind] }, theme)); return; }
    fail('MongoDB login', boxes[kind], err);
  }
}

// ---------- stage 5: seed ----------
function seed() {
  stage('Seed');
  if (opts.check || opts.noSeed) { record('Seed', 'SKIP', opts.check ? '--check' : '--no-seed'); return; }
  const args = ['src/scripts/seed.js', ...(opts.demo ? ['--demo'] : [])];
  const res = spawnSync(process.execPath, args, { cwd: SERVER, encoding: 'utf8' });
  log(res.stdout || ''); log(res.stderr || '');
  if (res.status !== 0) {
    fail('Seed', {
      what: `Seeding failed (exit ${res.status}).`,
      cause: (res.stderr || res.stdout || '').trim().split('\n').pop() || 'See run.log.',
      fix: 'Check MongoDB is reachable, then run `npm run seed` to see the full error.',
    });
  }
  record('Seed', 'OK', opts.demo ? 'roles, permissions, Super Admin + demo users' : 'roles, permissions, Super Admin (idempotent)');
}

// ---------- stage 6: launch ----------
const portFree = (port) => new Promise((resolve) => {
  const srv = net.createServer();
  srv.once('error', () => resolve(false));
  srv.once('listening', () => srv.close(() => resolve(true)));
  srv.listen(port);
});

async function waitForHttp(url, timeoutMs, isAlive) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end && isAlive()) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  return false;
}

function pipeOutput(child, name, color) {
  const prefix = theme.paint(color, `[${name}]`);
  for (const stream of [child.stdout, child.stderr]) {
    readline.createInterface({ input: stream }).on('line', (line) => say(`${prefix} ${line}`));
  }
}

async function launch(serverEnv) {
  stage('Launch');
  const wantServer = Number(serverEnv.PORT) || 5000;
  const serverPort = await findFreePort(wantServer, portFree);
  const clientPort = await findFreePort(5173, async (p) => p !== serverPort && portFree(p));
  if (!serverPort || !clientPort) {
    fail('Ports', { what: 'No free ports found near 5000 / 5173.', cause: 'Other programs are using these ports.', fix: 'Stop the other dev servers (or set PORT in server/.env) and re-run.' });
  }
  record('Ports', serverPort === wantServer && clientPort === 5173 ? 'OK' : 'WARN', `API :${serverPort}, client :${clientPort}${serverPort !== wantServer || clientPort !== 5173 ? ' (default port busy, using next free)' : ''}`);

  const apiBase = `http://localhost:${serverPort}/api`;
  const clientUrl = `http://localhost:${clientPort}`;
  const corsOrigins = [...new Set([...(serverEnv.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean), clientUrl])].join(',');
  const children = [];
  let stopping = false;

  const stopAll = (code) => {
    if (stopping) return;
    stopping = true;
    say('\nStopping server and client...');
    for (const c of children) if (c.exitCode === null) c.kill('SIGTERM');
    setTimeout(() => { for (const c of children) if (c.exitCode === null) c.kill('SIGKILL'); finish(code); }, 1500).unref();
    Promise.all(children.map((c) => (c.exitCode !== null ? null : new Promise((r) => c.once('exit', r))))).then(() => finish(code));
  };

  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: SERVER, env: { ...process.env, PORT: String(serverPort), CORS_ORIGINS: corsOrigins }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const client = spawn(process.execPath, [path.join(CLIENT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(clientPort), '--strictPort'], {
    cwd: CLIENT, env: { ...process.env, VITE_API_BASE_URL: apiBase }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(server, client);
  pipeOutput(server, 'server', 'cyan');
  pipeOutput(client, 'client', 'yellow');
  for (const [name, child] of [['Server', server], ['Client', client]]) {
    child.once('exit', (code, signal) => {
      if (stopping) return;
      rows.push({ name: `${name} process`, status: 'FAIL', detail: `exited (${signal || code})` });
      say(renderErrorBox({ title: `${name} stopped`, what: `The ${name.toLowerCase()} exited unexpectedly (${signal || `code ${code}`}).`, cause: 'See the log lines above (also in run.log).', fix: 'Fix the error shown above and re-run node run.mjs.' }, theme));
      stopAll(1);
    });
  }
  process.on('SIGINT', () => stopAll(0));
  process.on('SIGTERM', () => stopAll(0));

  const alive = () => !stopping;
  const apiOk = await waitForHttp(`${apiBase}/health`, 45000, alive);
  if (!stopping) record('API health', apiOk ? 'OK' : 'FAIL', apiOk ? `${apiBase}/health` : 'no healthy response within 45s');
  const webOk = apiOk && (await waitForHttp(clientUrl, 45000, alive));
  if (!stopping && apiOk) record('Client', webOk ? 'OK' : 'FAIL', webOk ? clientUrl : 'did not respond within 45s');
  if (stopping) return;
  if (!apiOk || !webOk) { stopAll(1); return; }

  const email = serverEnv.SEED_ADMIN_EMAIL || 'admin@inventory.local';
  const pw = serverEnv.SEED_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  say(`\n${renderSummary(rows, theme)}`);
  say(`\n${theme.paint('green', theme.paint('bold', 'Ready.'))} Open ${theme.paint('bold', clientUrl)}   (API ${apiBase})`);
  say(`Sign in: ${email} / ${pw === DEFAULT_ADMIN_PASSWORD ? pw : 'SEED_ADMIN_PASSWORD from server/.env'}${opts.demo ? '   demo: manager@inventory.local, sales@inventory.local / Demo@12345' : ''}`);
  say('Press Ctrl+C to stop.\n');
}

// ---------- main ----------
async function main() {
  const pre = preflight();
  const { serverEnv } = config();
  installDeps();
  checkImports();
  await mongo(pre, serverEnv);
  seed();
  if (opts.check) {
    say(`\n${theme.paint('bold', 'Diagnostics only (--check): nothing was installed, created or started.')}`);
    finish(exitCodeFor(rows));
  }
  await launch(serverEnv);
}

main().catch((err) => {
  if (err instanceof Fatal) {
    say(`\n${renderErrorBox(err.box, theme)}`);
    if (err.cause) log(err.cause.stack || String(err.cause));
  } else {
    rows.push({ name: 'Runner', status: 'FAIL', detail: err.message });
    say(`\n${renderErrorBox({ title: 'Unexpected error', what: err.message, cause: 'A bug in the runner or an unusual environment.', fix: 'See the traceback in run.log and report it.' }, theme)}`);
    log(err.stack || String(err));
  }
  finish(1);
});

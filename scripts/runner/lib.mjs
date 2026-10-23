// Pure helpers for run.mjs (no I/O), unit-tested in lib.test.mjs.
import { createHash } from 'node:crypto';

export class UsageError extends Error {}

export const FLAGS = {
  '--check': ['check', 'Diagnostics only: no installs, no file changes, no launch'],
  '--demo': ['demo', 'Seed demo manager / sales users too'],
  '--no-seed': ['noSeed', 'Skip the (idempotent) seed step'],
  '--no-install': ['noInstall', 'Skip npm install even if dependencies changed'],
  '--start-mongo': ['startMongo', 'Start a local MongoDB Docker container without asking'],
  '--no-color': ['noColor', 'Disable coloured output'],
  '--ascii': ['ascii', 'ASCII-only badges and boxes'],
  '--help': ['help', 'Show this help'],
};

export function parseArgs(argv) {
  const opts = Object.fromEntries(Object.values(FLAGS).map(([k]) => [k, false]));
  for (const arg of argv) {
    if (arg === '-h') { opts.help = true; continue; }
    const flag = FLAGS[arg];
    if (!flag) throw new UsageError(`Unknown option: ${arg}`);
    opts[flag[0]] = true;
  }
  return opts;
}

export function helpText() {
  const lines = Object.entries(FLAGS).map(([f, [, d]]) => `  ${f.padEnd(15)} ${d}`);
  return ['Usage: node run.mjs [options]   (or: npm start -- [options])', '', 'Options:', ...lines].join('\n');
}

export function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    const quoted = value.match(/^(['"])(.*)\1$/);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, '');
    out[m[1]] = value;
  }
  return out;
}

export function fillEnvTemplate(template, overrides) {
  return template
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
      return m && overrides[m[1]] !== undefined ? `${m[1]}=${overrides[m[1]]}` : line;
    })
    .join('\n');
}

export const isSecretKey = (key) => /SECRET|PASSWORD|TOKEN|KEY|PASS$/i.test(key);

export function maskSecret(value) {
  if (!value) return '(empty)';
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}****${value.slice(-2)} (${value.length} chars)`;
}

export function maskMongoUri(uri) {
  return uri.replace(/\/\/([^:@/]+):([^@/]*)@/, '//$1:****@');
}

export function parseMongoUri(uri) {
  const m = String(uri || '').match(/^mongodb(\+srv)?:\/\/(?:([^:@/]+)(?::([^@/]*))?@)?([^/?]+)(?:\/([^?]*))?(?:\?.*)?$/);
  if (!m) throw new Error('MONGODB_URI must look like mongodb://host:port/dbname');
  const srv = Boolean(m[1]);
  const firstHost = m[4].split(',')[0];
  const hm = firstHost.match(/^\[?([^\]]+?)\]?(?::(\d+))?$/);
  if (!hm || !hm[1]) throw new Error(`Cannot read host from "${firstHost}"`);
  const port = hm[2] ? Number(hm[2]) : 27017;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid port "${hm[2]}"`);
  return { srv, host: hm[1], port, db: m[5] || '', hasCredentials: Boolean(m[2]) };
}

export function isLocalHost(host) {
  return ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(host);
}

export function classifyMongoError(err) {
  const text = `${err?.name || ''} ${err?.code || ''} ${err?.codeName || ''} ${err?.message || ''} ${err?.cause?.message || ''}`;
  if (/Authentication failed|AuthenticationFailed|auth failed|\b18\b.*auth|requires authentication|Unauthorized/i.test(text)) return 'auth';
  if (/Invalid scheme|Invalid connection string|URI must|MongoParseError|Cannot read host|Invalid port|ENOTFOUND|EAI_AGAIN/i.test(text)) return 'bad_uri';
  if (/ECONNREFUSED|ServerSelection|timed out|ETIMEDOUT|ECONNRESET|EHOSTUNREACH|port closed/i.test(text)) return 'not_running';
  return 'other';
}

export function parseVersion(v) {
  const m = String(v).trim().replace(/^v/, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)];
}

export function versionAtLeast(version, min) {
  const a = parseVersion(version);
  const b = parseVersion(min);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

export function depsHash(...texts) {
  const h = createHash('sha256');
  for (const t of texts) h.update(String(t ?? '')).update('\0');
  return h.digest('hex');
}

export async function findFreePort(preferred, isFree, attempts = 20) {
  for (let port = preferred; port < preferred + attempts; port += 1) {
    if (await isFree(port)) return port;
  }
  return null;
}

const ANSI = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m' };
const BADGE_COLOR = { OK: 'green', WARN: 'yellow', FAIL: 'red', SKIP: 'gray', INFO: 'cyan' };

export function makeTheme({ color = false, unicode = true } = {}) {
  const paint = (name, s) => (color ? `${ANSI[name]}${s}${ANSI.reset}` : s);
  return {
    color,
    unicode,
    paint,
    badge: (status) => paint(BADGE_COLOR[status] || 'bold', `[${status.padEnd(4)}]`),
    box: unicode
      ? { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' }
      : { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' },
  };
}

export const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');

function wrap(text, width) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && (line + ' ' + word).length > width) { out.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out;
}

export function renderErrorBox({ title, what, cause, fix }, theme, width = 76) {
  const inner = width - 4;
  const { tl, tr, bl, br, h, v } = theme.box;
  const rows = [];
  const add = (label, text) => {
    const labelled = wrap(text, inner - 14);
    labelled.forEach((t, i) => rows.push(`${(i === 0 ? label : '').padEnd(14)}${t}`));
  };
  add('What failed:', what);
  add('Likely cause:', cause);
  add('How to fix:', fix);
  const head = ` ${title} `;
  const top = `${tl}${h}${head}${h.repeat(Math.max(0, width - 3 - head.length))}${tr}`;
  const body = rows.map((r) => `${v} ${r.padEnd(inner)} ${v}`);
  const bottom = `${bl}${h.repeat(width - 2)}${br}`;
  return theme.paint('red', [top, ...body, bottom].join('\n'));
}

export function renderSummary(rows, theme) {
  const nameW = Math.max(5, ...rows.map((r) => r.name.length));
  const lines = [theme.paint('bold', `${'Check'.padEnd(nameW)}  Status  Detail`)];
  for (const r of rows) lines.push(`${r.name.padEnd(nameW)}  ${theme.badge(r.status)}  ${r.detail || ''}`);
  return lines.join('\n');
}

export function exitCodeFor(rows) {
  return rows.some((r) => r.status === 'FAIL') ? 1 : 0;
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  UsageError, classifyMongoError, depsHash, exitCodeFor, fillEnvTemplate, findFreePort, isSecretKey, makeTheme,
  maskMongoUri, maskSecret, parseArgs, parseEnvFile, parseMongoUri, renderErrorBox, renderSummary, stripAnsi,
  versionAtLeast,
} from './lib.mjs';

test('parseArgs maps flags and rejects unknown ones', () => {
  const o = parseArgs(['--check', '--demo']);
  assert.equal(o.check, true);
  assert.equal(o.demo, true);
  assert.equal(o.noSeed, false);
  assert.equal(parseArgs(['-h']).help, true);
  assert.throws(() => parseArgs(['--nope']), UsageError);
});

test('parseEnvFile handles comments, quotes, export and inline comments', () => {
  const env = parseEnvFile('# c\nPORT=5000\nexport A="x y"\nB=\'q\'\nC=val # note\n\nbad line\nD=');
  assert.deepEqual(env, { PORT: '5000', A: 'x y', B: 'q', C: 'val', D: '' });
});

test('fillEnvTemplate replaces only the given keys', () => {
  const out = fillEnvTemplate('# x\nJWT_SECRET=change-me\nPORT=5000', { JWT_SECRET: 'abc' });
  assert.equal(out, '# x\nJWT_SECRET=abc\nPORT=5000');
});

test('masking never reveals the full secret', () => {
  assert.equal(isSecretKey('JWT_SECRET'), true);
  assert.equal(isSecretKey('SEED_ADMIN_PASSWORD'), true);
  assert.equal(isSecretKey('PORT'), false);
  const secret = 'abcdefghijklmnop';
  assert.ok(!maskSecret(secret).includes(secret));
  assert.equal(maskSecret(''), '(empty)');
  assert.equal(maskSecret('abc'), '****');
  assert.equal(maskMongoUri('mongodb://u:p4ss@h:1/db'), 'mongodb://u:****@h:1/db');
  assert.equal(maskMongoUri('mongodb://localhost:27017/db'), 'mongodb://localhost:27017/db');
});

test('parseMongoUri reads host, port, db and credentials', () => {
  assert.deepEqual(parseMongoUri('mongodb://localhost:27017/inventory_poc'), { srv: false, host: 'localhost', port: 27017, db: 'inventory_poc', hasCredentials: false });
  assert.equal(parseMongoUri('mongodb://u:p@127.0.0.1/x?authSource=admin').hasCredentials, true);
  assert.equal(parseMongoUri('mongodb://127.0.0.1/x').port, 27017);
  assert.equal(parseMongoUri('mongodb+srv://u:p@cluster.example.net/db').srv, true);
  assert.throws(() => parseMongoUri('http://localhost'));
  assert.throws(() => parseMongoUri('mongodb://localhost:99999/db'));
});

test('classifyMongoError buckets common driver errors', () => {
  assert.equal(classifyMongoError({ message: 'Authentication failed.', codeName: 'AuthenticationFailed' }), 'auth');
  assert.equal(classifyMongoError({ name: 'MongoServerSelectionError', message: 'connect ECONNREFUSED 127.0.0.1:27017' }), 'not_running');
  assert.equal(classifyMongoError({ message: 'getaddrinfo ENOTFOUND mongo.bad' }), 'bad_uri');
  assert.equal(classifyMongoError({ name: 'MongoParseError', message: 'Invalid scheme' }), 'bad_uri');
  assert.equal(classifyMongoError({ message: 'something odd' }), 'other');
});

test('versionAtLeast compares semver-ish versions', () => {
  assert.equal(versionAtLeast('v24.1.0', '22.0.0'), true);
  assert.equal(versionAtLeast('22.0.0', '22.0.0'), true);
  assert.equal(versionAtLeast('20.11.1', '22.0.0'), false);
  assert.equal(versionAtLeast('garbage', '22.0.0'), false);
});

test('depsHash is stable and content-sensitive', () => {
  assert.equal(depsHash('a', 'b'), depsHash('a', 'b'));
  assert.notEqual(depsHash('a', 'b'), depsHash('ab', ''));
});

test('findFreePort returns the first free port or null', async () => {
  const busy = new Set([5000, 5001]);
  assert.equal(await findFreePort(5000, async (p) => !busy.has(p)), 5002);
  assert.equal(await findFreePort(5000, async () => false, 3), null);
});

test('theme badges and boxes render with and without colour / unicode', () => {
  const plain = makeTheme({ color: false, unicode: false });
  assert.equal(plain.badge('OK'), '[OK  ]');
  const coloured = makeTheme({ color: true, unicode: true });
  assert.notEqual(coloured.badge('FAIL'), '[FAIL]');
  assert.equal(stripAnsi(coloured.badge('FAIL')), '[FAIL]');
  const box = renderErrorBox({ title: 'MongoDB', what: 'Nothing on 27017.', cause: 'Not running.', fix: 'Start it.' }, plain, 60);
  const lines = box.split('\n');
  assert.ok(lines[0].startsWith('+- MongoDB '));
  assert.ok(lines.every((l) => l.length === 60), 'box lines are equal width');
  assert.match(box, /What failed: +Nothing on 27017\./);
  assert.match(box, /Likely cause: Not running\./);
  assert.match(box, /How to fix: +Start it\./);
  assert.ok(renderErrorBox({ title: 't', what: 'w', cause: 'c', fix: 'f' }, coloured).includes('┌'));
});

test('renderSummary and exitCodeFor', () => {
  const rows = [{ name: 'Node.js', status: 'OK', detail: 'v24' }, { name: 'MongoDB', status: 'FAIL', detail: 'down' }];
  const out = renderSummary(rows, makeTheme());
  assert.match(out, /Node\.js +\[OK  \] +v24/);
  assert.equal(exitCodeFor(rows), 1);
  assert.equal(exitCodeFor([{ name: 'x', status: 'WARN' }]), 0);
});

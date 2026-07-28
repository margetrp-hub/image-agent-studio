import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStandaloneAuthStore } from './studio-service/standaloneAuth.js';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-admin-cli-'));
const databasePath = path.join(tempDir, 'auth.sqlite');
const password = 'CLI Password 123!';
const args = [
  'scripts/create-standalone-admin.mjs',
  '--database', databasePath,
  '--email', 'root-admin@yhoo.lol',
  '--username', 'Root Admin'
];
assert.equal(args.includes(password), false);

const child = spawn(process.execPath, args, {
  cwd: path.resolve(import.meta.dirname, '..'),
  stdio: ['pipe', 'pipe', 'pipe']
});
let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
child.stdin.end(`${password}\n`);
const exitCode = await new Promise((resolve) => child.once('exit', resolve));
assert.equal(exitCode, 0, stderr);
assert.equal(stdout.includes(password), false);
assert.equal(stderr.includes(password), false);

const store = createStandaloneAuthStore({ databasePath, passwordIterations: 100_000 });
const users = store.listUsers();
assert.equal(users.length, 1);
assert.equal(users[0].role, 'admin');
assert.equal(users[0].email, 'root-admin@yhoo.lol');
store.close();

console.log(JSON.stringify({ ok: true, databasePath, user: users[0] }, null, 2));

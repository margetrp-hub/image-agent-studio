import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseJsonText } from './studio-service/jsonFiles.js';
import { createUserStorage } from './studio-service/userStorage.js';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-storage-security-'));
const userA = { userDir: path.join(dataDir, 'users', 'user-a') };
const userB = { userDir: path.join(dataDir, 'users', 'user-b') };
const victimPath = path.join(userB.userDir, 'sessions', 'victim.json');
const authDatabasePath = path.join(dataDir, 'auth.sqlite');
await fs.mkdir(path.dirname(victimPath), { recursive: true });
await fs.writeFile(victimPath, '{"owner":"user-b"}\n');
await fs.writeFile(authDatabasePath, 'auth-database-sentinel');

const storage = createUserStorage({
  historyLimit: 20,
  sessionAssetPrefix: 'session-',
  parseJsonText
});

await storage.writeSession(userA, { sessionId: 'desk_alpha', prompt: 'safe' }, 'desk_alpha');
assert.equal((await storage.readSession(userA, 'desk_alpha')).prompt, 'safe');

const attacks = [
  '../user-b/sessions/victim',
  'x/../../../../users',
  '..\\user-b\\sessions\\victim',
  'contains.dot',
  'x'.repeat(121)
];

for (const sessionId of attacks) {
  assert.throws(() => storage.sessionPathForId(userA, sessionId), (error) => error.message === 'SESSION_ID_INVALID');
  assert.throws(() => storage.sessionAssetId(sessionId), (error) => error.message === 'SESSION_ID_INVALID');
  await assert.rejects(
    storage.writeSession(userA, { sessionId, prompt: 'attack' }, sessionId),
    (error) => error.message === 'SESSION_ID_INVALID'
  );
  await assert.rejects(storage.readSession(userA, sessionId), (error) => error.message === 'SESSION_ID_INVALID');
}

assert.equal(await fs.readFile(victimPath, 'utf8'), '{"owner":"user-b"}\n');
assert.equal(await fs.readFile(authDatabasePath, 'utf8'), 'auth-database-sentinel');

console.log(JSON.stringify({ ok: true, attacksRejected: attacks.length, dataDir }, null, 2));

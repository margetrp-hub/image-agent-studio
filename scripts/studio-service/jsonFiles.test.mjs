import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { atomicWriteJson } from './jsonFiles.js';

const root = path.resolve(import.meta.dirname, '../../output');
await fs.mkdir(root, { recursive: true });

test('Windows transient replacement denial retries the completed file without losing state', { skip: process.platform !== 'win32' }, async (t) => {
  const dir = await fs.mkdtemp(path.join(root, 'atomic-retry-'));
  const file = path.join(dir, 'job.json');
  await atomicWriteJson(file, { status: 'saving' });
  const rename = fs.rename.bind(fs);
  let calls = 0;
  t.mock.method(fs, 'rename', async (...args) => {
    calls += 1;
    if (calls <= 2) throw Object.assign(new Error('reader busy'), { code: 'EPERM' });
    return rename(...args);
  });
  await atomicWriteJson(file, { status: 'succeeded', resultUrls: ['/private/result.png'] });
  assert.equal(calls, 3);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { status: 'succeeded', resultUrls: ['/private/result.png'] });
  assert.deepEqual(await fs.readdir(dir), ['job.json']);
});

test('Permanent replacement failure preserves the previous record and removes only its temporary file', async (t) => {
  const dir = await fs.mkdtemp(path.join(root, 'atomic-failure-'));
  const file = path.join(dir, 'job.json');
  await atomicWriteJson(file, { status: 'saving', requestIds: ['known-upstream-id'] });
  let calls = 0;
  t.mock.method(fs, 'rename', async () => {
    calls += 1;
    throw Object.assign(new Error('access denied'), { code: 'EPERM' });
  });
  await assert.rejects(atomicWriteJson(file, { status: 'succeeded' }), { code: 'EPERM' });
  assert.equal(calls, process.platform === 'win32' ? 5 : 1);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { status: 'saving', requestIds: ['known-upstream-id'] });
  assert.deepEqual(await fs.readdir(dir), ['job.json']);
});

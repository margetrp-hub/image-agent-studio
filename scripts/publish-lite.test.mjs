import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { root, sha256 } from './lite-artifacts.mjs';
import { publishLite } from './publish-lite.mjs';

async function fixture(t) {
  await fs.mkdir(path.join(root, 'output'), { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, 'output/lite-publish-test-'));
  t.after(() => fs.rm(directory, { recursive: true }));
  const source = 'a'.repeat(40);
  const archive = Buffer.from('isolated deterministic test package');
  const manifest = { variant: 'lite', dirty: false, version: 'v1', source, archive: 'app-lite-v1.tar.gz', sha256: sha256(archive) };
  await fs.writeFile(path.join(directory, manifest.archive), archive);
  await fs.writeFile(path.join(directory, 'app-lite.sha256'), `${manifest.sha256}  ${manifest.archive}\n`);
  await fs.writeFile(path.join(directory, 'app-lite.json'), JSON.stringify(manifest));
  const assets = [];
  const writes = [];
  const state = { loseReply: false, tagSource: source, draft: false };
  const json = value => new Response(JSON.stringify(value));
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    if (options.method === 'POST') {
      const name = parsed.searchParams.get('name');
      assert.equal(assets.some(asset => asset.name === name), false, 'must not duplicate uploaded assets');
      const item = { id: assets.length + 1, name, bytes: Buffer.from(options.body) };
      assets.push(item); writes.push(name);
      if (state.loseReply) { state.loseReply = false; throw new Error('connection reset after upload'); }
      return json({ id: item.id });
    }
    if (parsed.pathname.includes('/releases/tags/')) return json({ id: 1, draft: state.draft, published_at: '2026-01-01', upload_url: 'https://upload.test/release{?name}' });
    if (parsed.pathname.includes('/commits/')) return json({ sha: state.tagSource });
    if (parsed.pathname.endsWith('/releases/1/assets')) return json(assets.map(({ id, name }) => ({ id, name })));
    const asset = assets.find(item => parsed.pathname.endsWith(`/releases/assets/${item.id}`));
    if (asset) return new Response(asset.bytes);
    throw new Error(`Unexpected request: ${url}`);
  };
  const run = () => publishLite({ directory, name: 'app', tag: 'v1', repository: 'owner/repo', token: 'test', fetchImpl });
  return { directory, manifest, assets, writes, state, run };
}

test('lost upload response reconciles existing bytes; receipt is last and complete retries write nothing', async t => {
  const f = await fixture(t);
  f.state.loseReply = true;
  await assert.rejects(f.run(), /connection reset/);
  assert.equal(f.assets.length, 1);
  await f.run();
  assert.deepEqual(f.writes, ['app-lite-v1.tar.gz', 'app-lite.sha256', 'app-lite.json']);
  await f.run();
  assert.equal(f.writes.length, 3);
});

test('mismatched immutable asset is preserved and no further assets are uploaded', async t => {
  const f = await fixture(t);
  f.assets.push({ id: 1, name: f.manifest.archive, bytes: Buffer.from('different package') });
  await assert.rejects(f.run(), /Immutable lite asset differs/);
  assert.equal(f.writes.length, 0);
  assert.equal(f.assets[0].bytes.toString(), 'different package');
});

test('dirty source, changed tag, draft release and corrupt archive cannot publish', async t => {
  const f = await fixture(t);
  f.state.tagSource = 'b'.repeat(40);
  await assert.rejects(f.run(), /source differ/);
  f.state.tagSource = f.manifest.source;
  f.state.draft = true;
  await assert.rejects(f.run(), /full release/);
  f.state.draft = false;
  await fs.writeFile(path.join(f.directory, 'app-lite.json'), JSON.stringify({ ...f.manifest, dirty: true }));
  await assert.rejects(f.run(), /dirty release input/);
  await fs.writeFile(path.join(f.directory, 'app-lite.json'), JSON.stringify(f.manifest));
  await fs.appendFile(path.join(f.directory, f.manifest.archive), 'corrupt');
  await assert.rejects(f.run(), /checksum mismatch/);
  assert.equal(f.writes.length, 0);
});

import assert from 'node:assert/strict';
import { createAssetBlobCache } from '../src/studio/util/assetBlobCache.js';
import { enqueueProtectedImageTask } from '../src/studio/util/assets.js';
import { buildLibrarySearchIndex, searchLibraryIndex } from '../src/studio/util/librarySearch.js';

const cache = createAssetBlobCache({ maxEntries: 3, maxBytes: 10 });
const blob = (size) => new Blob([new Uint8Array(size)]);
cache.set('a', blob(4));
cache.set('b', blob(4));
cache.get('a');
cache.set('c', blob(4));
assert.equal(cache.get('b'), undefined);
assert.equal(cache.bytes, 8);
cache.set('a', blob(2));
assert.equal(cache.bytes, 6);
cache.set('large', blob(20));
assert.equal(cache.bytes, 6);
assert.equal(cache.get('large'), undefined);
cache.set('d', blob(1));
cache.set('e', blob(1));
assert.equal(cache.size, 3);
assert.equal(cache.bytes, 4);

let release;
const gate = new Promise((resolve) => { release = resolve; });
const occupying = Array.from({ length: 6 }, () => enqueueProtectedImageTask(() => gate));
const controller = new AbortController();
let obsoleteRequests = 0;
const obsolete = enqueueProtectedImageTask(() => { obsoleteRequests++; }, { signal: controller.signal });
controller.abort();
await assert.rejects(obsolete, { name: 'AbortError' });
release();
await Promise.all(occupying);
assert.equal(obsoleteRequests, 0);
await assert.rejects(enqueueProtectedImageTask(() => { throw new Error('sync failure'); }), /sync failure/);
assert.equal(await enqueueProtectedImageTask(() => 'still usable'), 'still usable');

const catalog = [
  { id: 1, title: 'Ceramic', category: 'product', prompt: '青花瓷 Bamboo handle', tags: ['teapot'] },
  { id: 2, title: 'Featured', category: 'portrait', prompt: 'Portrait', featured: true }
];
const index = buildLibrarySearchIndex(catalog, (category) => category === 'product' ? '产品' : '人像');
assert.deepEqual(searchLibraryIndex(index).map((item) => item.id), [2, 1]);
assert.deepEqual(searchLibraryIndex(index, { query: '产品 ＢＡＭＢＯＯ' }).map((item) => item.id), [1]);
assert.deepEqual(searchLibraryIndex(index, { query: '青花瓷 teapot', category: 'portrait' }), []);
assert.deepEqual(searchLibraryIndex(index, { favoritesOnly: true, favorites: new Set(['1']) }).map((item) => item.id), [1]);
console.log('PASS: byte-bounded media cache, obsolete image cancellation, search index.');

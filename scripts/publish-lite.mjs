import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256 } from './lite-artifacts.mjs';

// The manifest is the completion receipt and is uploaded last. Existing bytes are
// reconciled before retry, never clobbered, including after an ambiguous timeout.
export async function publishLite({ directory, name, tag, repository, token, api = 'https://api.github.com', fetchImpl = fetch }) {
  if (!tag || !repository || !token) throw new Error('A published release tag, repository and token are required');
  const manifestName = `${name}-lite.json`;
  const manifestBytes = await fs.readFile(path.join(directory, manifestName));
  const manifest = JSON.parse(manifestBytes);
  if (manifest.variant !== 'lite' || manifest.dirty || manifest.version !== tag || !/^[0-9a-f]{40}$/.test(manifest.source)) throw new Error('Invalid or dirty release input');
  if (path.basename(manifest.archive) !== manifest.archive) throw new Error('Invalid archive name');
  const archive = await fs.readFile(path.join(directory, manifest.archive));
  if (sha256(archive) !== manifest.sha256) throw new Error('Archive checksum mismatch');
  const checksumName = `${name}-lite.sha256`;
  const checksums = await fs.readFile(path.join(directory, checksumName));
  if (checksums.toString() !== `${manifest.sha256}  ${manifest.archive}\n`) throw new Error('Invalid checksum receipt');
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  async function request(url, options = {}) {
    const response = await fetchImpl(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`GitHub ${response.status}: ${options.method || 'GET'} ${new URL(url).pathname}. Rerun to reconcile existing assets.`);
    return response;
  }
  const base = `${api}/repos/${repository}`;
  const release = await (await request(`${base}/releases/tags/${encodeURIComponent(tag)}`)).json();
  if (release.draft || !release.published_at) throw new Error('Publish the full release before attaching lite assets');
  const commit = await (await request(`${base}/commits/${encodeURIComponent(tag)}`)).json();
  if (commit.sha !== manifest.source) throw new Error('Release tag and lite source differ');
  const assets = [];
  for (let page = 1; ; page++) {
    const batch = await (await request(`${base}/releases/${release.id}/assets?per_page=100&page=${page}`)).json();
    assets.push(...batch);
    if (batch.length < 100) break;
  }
  const expected = [[manifest.archive, archive], [checksumName, checksums], [manifestName, manifestBytes]];
  // Reconcile all existing assets before the first write.
  for (const [filename, bytes] of expected) {
    const existing = assets.find(item => item.name === filename);
    if (!existing) continue;
    const remote = Buffer.from(await (await request(`${base}/releases/assets/${existing.id}`, { headers: { Accept: 'application/octet-stream' } })).arrayBuffer());
    if (sha256(remote) !== sha256(bytes)) throw new Error(`Immutable lite asset differs: ${filename}. Preserve the existing release; publish corrections under a new version.`);
  }
  for (const [filename, bytes] of expected) {
    if (assets.some(item => item.name === filename)) continue;
    const url = new URL(release.upload_url.split('{')[0]);
    url.searchParams.set('name', filename);
    const uploaded = await (await request(url.toString(), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes })).json();
    const remote = Buffer.from(await (await request(`${base}/releases/assets/${uploaded.id}`, { headers: { Accept: 'application/octet-stream' } })).arrayBuffer());
    if (sha256(remote) !== sha256(bytes)) throw new Error(`Uploaded checksum differs: ${filename}`);
  }
  console.log(`Verified lite assets for ${repository}@${tag} (${manifest.source})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await publishLite({ directory: path.resolve('output/lite'), name: process.argv[2], tag: process.env.RELEASE_TAG,
    repository: process.env.GITHUB_REPOSITORY, token: process.env.GH_TOKEN, api: process.env.GITHUB_API_URL || 'https://api.github.com' });
}

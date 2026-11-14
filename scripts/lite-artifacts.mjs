import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const root = path.resolve(import.meta.dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
export const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function copyTracked(stage, from, to = from) {
  const files = tracked.filter(file => file === from || file.startsWith(`${from}/`));
  if (!files.length) throw new Error(`Missing tracked input: ${from}`);
  for (const file of files) {
    const dest = path.join(stage, to + file.slice(from.length));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(path.join(root, file), dest);
  }
}

async function walk(dir, prefix = '') {
  const files = [];
  for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const key = prefix + entry.name;
    if (entry.isDirectory()) files.push(...await walk(path.join(dir, entry.name), key + '/'));
    else if (entry.isFile()) files.push(key);
    else throw new Error(`Unsupported package input: ${key}`);
  }
  return files;
}

export async function copyDist(stage) {
  const publicFiles = new Set(tracked.filter(file => file.startsWith('public/')).map(file => file.slice(7)));
  const localPublic = new Set(await walk(path.join(root, 'public')));
  for (const file of await walk(path.join(root, 'dist'))) {
    // Vite copies untracked artwork too. It is never part of a distributable.
    if (localPublic.has(file) && !publicFiles.has(file)) continue;
    const dest = path.join(stage, 'dist', file);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(path.join(root, 'dist', file), dest);
  }
}

export async function prepare(name) {
  const source = git('rev-parse', 'HEAD');
  const version = process.env.RELEASE_TAG || `preview-${source.slice(0, 12)}`;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(version)) throw new Error('Invalid release tag');
  const output = path.join(root, 'output', 'lite');
  await fs.mkdir(output, { recursive: true });
  const stage = await fs.mkdtemp(path.join(root, 'output', 'lite-stage-'));
  return { name, source, version, output, stage, dirty: Boolean(git('diff', 'HEAD', '--name-only')) };
}

export async function finish(info) {
  const { stage, output, name, version, source, dirty } = info;
  const files = await walk(stage);
  const inventory = {};
  for (const file of files) {
    const full = path.join(stage, file);
    inventory[file] = sha256(await fs.readFile(full));
    // Stable archives make interrupted publication safe to retry from the same source.
    await fs.utimes(full, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'));
    await fs.chmod(full, 0o644);
  }
  const list = path.join(output, `${name}-lite-files.txt`);
  await fs.writeFile(list, files.join('\n') + '\n');
  const archive = `${name}-lite-${version}.tar.gz`;
  const ownership = process.platform === 'win32' ? ['--uid=0', '--gid=0', '--uname=root', '--gname=root'] : ['--owner=0', '--group=0', '--numeric-owner'];
  execFileSync('tar', [...ownership, '-czf', path.join(output, archive), '-C', stage, '-T', list], { stdio: 'inherit' });
  const checksum = sha256(await fs.readFile(path.join(output, archive)));
  const manifest = { schema: 1, variant: 'lite', name, version, source, dirty, archive, sha256: checksum, files: inventory };
  await fs.writeFile(path.join(output, `${name}-lite.json`), JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(output, `${name}-lite.sha256`), `${checksum}  ${archive}\n`);
  // Only this freshly created staging directory is removed. User data is never staged here.
  await fs.rm(stage, { recursive: true });
  console.log(`Lite package: ${path.join(output, archive)} (${source}${dirty ? ', local edits: publication disabled' : ''})`);
}

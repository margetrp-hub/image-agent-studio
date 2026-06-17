import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.argv[2] || '.');
const required = [
  'scripts/image-sub2api-studio-history-service.mjs',
  'scripts/studio-service/jsonFiles.js',
  'scripts/studio-service/userStorage.js',
  'scripts/studio-service/communityPrompts.js',
  'scripts/studio-service/userBackup.js'
];

const missing = required.filter((item) => !fs.existsSync(path.join(root, item)));
if (missing.length) {
  console.error(JSON.stringify({ ok: false, root, missing }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, root, required }, null, 2));

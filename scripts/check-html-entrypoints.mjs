import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = ['index.html', 'studio.html'];
const suspiciousTokens = [
  '\uFFFD',
  '锟',
  '鍔犺浇',
  '涓婁紶',
  '鐢熸垚',
  '浼氳瘽',
  '鍒涗綔',
  '绠€浣',
  '锛'
];

const failures = [];

for (const file of files) {
  const body = fs.readFileSync(path.join(root, file), 'utf8');
  for (const token of suspiciousTokens) {
    if (body.includes(token)) {
      failures.push(`${file}: suspicious encoding artifact ${JSON.stringify(token)}`);
    }
  }
}

const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const studioHtml = fs.readFileSync(path.join(root, 'studio.html'), 'utf8');

if (!indexHtml.includes('Image Agent Studio')) {
  failures.push('index.html: root entry should present the Image Agent Studio name.');
}

if (indexHtml.includes('image-sub2api-studio open-source Sub2API image generation workstation')) {
  failures.push('index.html: root entry still describes the project as a Sub2API-only workstation.');
}

if (!studioHtml.includes('Image Agent Studio')) {
  failures.push('studio.html: Studio title should present the Image Agent Studio name.');
}

if (!studioHtml.includes('OpenAI 兼容接口') || !studioHtml.includes('NewAPI')) {
  failures.push('studio.html: Studio description should mention provider-neutral compatible APIs.');
}

if (failures.length) {
  console.error(`HTML entrypoint check failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log('HTML entrypoint check passed.');

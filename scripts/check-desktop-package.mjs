import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function mustInclude(file, needle, message) {
  if (!read(file).includes(needle)) fail(`${file}: ${message}`);
}

function mustNotInclude(file, needle, message) {
  if (read(file).includes(needle)) fail(`${file}: ${message}`);
}

mustInclude('package.json', '"main": "apps/desktop/main.mjs"', 'desktop main entry must stay explicit.');
mustInclude('apps/desktop/main.mjs', 'image-agent-studio-history-service.mjs', 'desktop app must launch the product-neutral history service.');
mustInclude('electron-builder.config.cjs', "productName: 'Image Agent Studio'", 'desktop product name must be Image Agent Studio.');
mustInclude('electron-builder.config.cjs', "'scripts/image-agent-studio-history-service.mjs'", 'desktop bundle must include the product-neutral history service.');
mustNotInclude('electron-builder.config.cjs', "'scripts/image-sub2api-studio-history-service.mjs'", 'desktop bundle should not carry the legacy service wrapper.');
mustInclude('scripts/package-windows.mjs', "copyIntoApp('scripts/image-agent-studio-history-service.mjs')", 'prepackaged Windows build must copy the product-neutral service.');
mustNotInclude('scripts/package-windows.mjs', "copyIntoApp('scripts/image-sub2api-studio-history-service.mjs')", 'prepackaged Windows build should not copy the legacy wrapper.');
mustInclude('scripts/image-sub2api-studio-history-service.mjs', "import './image-agent-studio-history-service.mjs';", 'legacy service entry must be a thin compatibility wrapper.');
mustInclude('.gitignore', 'release/desktop/', 'desktop release artifacts must stay out of source control.');

if (process.exitCode) process.exit(process.exitCode);
console.log('Desktop package check passed.');

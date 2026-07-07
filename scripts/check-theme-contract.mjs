import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const tokenPath = path.join(root, 'packages/theme/tokens.json');
const raw = fs.readFileSync(tokenPath, 'utf8');
const tokens = JSON.parse(raw);

assert.equal(tokens.name, 'image-agent-studio-theme');
assert.equal(tokens.displayName?.en, 'Image Agent Studio');
assert.equal(tokens.displayName?.['zh-CN'], '创作工作台');

for (const group of ['spacing', 'radius', 'stroke', 'typography', 'motion', 'themes', 'product']) {
  assert.ok(tokens[group], `missing token group: ${group}`);
}

for (const mode of ['light', 'dark']) {
  const color = tokens.themes?.[mode]?.color;
  assert.ok(color, `missing ${mode} color tokens`);
  for (const group of ['bg', 'text', 'border', 'accent', 'status', 'overlay']) {
    assert.ok(color[group], `missing ${mode}.color.${group}`);
  }
}

for (const group of ['composer', 'canvas', 'referencePanel', 'queue']) {
  assert.ok(tokens.product?.[group], `missing product.${group}`);
}

const forbidden = ['sub2api', 'newapi', 'codex2api', 'cpa'];
for (const word of forbidden) {
  assert.ok(!raw.toLowerCase().includes(word), `theme tokens must not contain provider name: ${word}`);
}

console.log('Theme contract passed.');

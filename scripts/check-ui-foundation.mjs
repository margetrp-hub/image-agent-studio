import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const dependencies = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };

assert.ok(dependencies['@radix-ui/react-dialog'], 'Dialog behavior must use Radix UI.');
assert.ok(dependencies['@radix-ui/react-switch'], 'Switch behavior must use Radix UI.');
for (const file of ['packages/theme/tokens.json', 'packages/theme/web.css', 'src/ui/index.js', 'src/ui/primitives.jsx', 'src/ui/primitives.css']) {
  assert.ok(fs.existsSync(path.join(root, file)), `missing UI foundation file: ${file}`);
}

const tokens = JSON.parse(fs.readFileSync(path.join(root, 'packages/theme/tokens.json'), 'utf8'));
assert.equal(tokens.displayName?.en, 'Image Agent Studio');
assert.equal(tokens.displayName?.['zh-CN'], '创作工作台');
assert.ok(tokens.product?.composer && tokens.product?.canvas, 'product tokens must cover core creative surfaces');

const foundation = fs.readFileSync(path.join(root, 'src/styles/studio.foundation.css'), 'utf8');
assert.match(foundation, /packages\/theme\/web\.css/);
assert.doesNotMatch(foundation, /--ias-bg:\s*#[0-9a-f]{6}/i, 'web mappings belong in packages/theme/web.css');

const webTheme = fs.readFileSync(path.join(root, 'packages/theme/web.css'), 'utf8');
const light = tokens.themes.light.color;
const dark = tokens.themes.dark.color;
for (const [variable, value] of Object.entries({
  '--ias-bg': light.bg.app,
  '--ias-canvas-bg': light.bg.canvas,
  '--ias-surface': light.bg.surface,
  '--ias-ink': light.text.primary,
  '--ias-line': light.border.default,
  '--ias-accent': light.accent.primary,
  '--ias-danger': light.status.danger,
  '--ias-success': light.status.success,
  '--ias-radius-control': tokens.radius.control,
  '--ias-motion-normal': tokens.motion.normal
})) {
  assert.ok(webTheme.includes(`${variable}: ${value};`), `Web light mapping drifted: ${variable}`);
}
for (const [variable, value] of Object.entries({
  '--ias-bg': dark.bg.app,
  '--ias-canvas-bg': dark.bg.canvas,
  '--ias-surface': dark.bg.surface,
  '--ias-ink': dark.text.primary,
  '--ias-line': dark.border.default,
  '--ias-accent': dark.accent.primary,
  '--ias-danger': dark.status.danger,
  '--ias-success': dark.status.success
})) {
  assert.ok(webTheme.includes(`${variable}: ${value};`), `Web dark mapping drifted: ${variable}`);
}

const architecture = fs.readFileSync(path.join(root, 'docs/THEME-ARCHITECTURE.md'), 'utf8');
assert.match(architecture, /Radix UI/);
assert.match(architecture, /Go does not render UI/);

const primitives = fs.readFileSync(path.join(root, 'src/ui/primitives.jsx'), 'utf8');
for (const component of ['Button', 'IconButton', 'Input', 'Notice', 'Switch', 'DialogContent']) {
  assert.match(primitives, new RegExp(`export (?:const|function) ${component}\\b`), `missing shared primitive: ${component}`);
}

const admin = fs.readFileSync(path.join(root, 'src/studioAdmin.jsx'), 'utf8');
assert.match(admin, /<Notice\b/);
assert.match(admin, /<IconButton\b/);

const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
assert.match(login, /class="iasInput"/);
assert.match(login, /iasButtonPrimary/);

console.log('UI foundation contract passed.');

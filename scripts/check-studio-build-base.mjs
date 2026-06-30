import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const htmlPath = path.join(root, 'dist', 'studio.html');
const maxStudioEntryBytes = 380 * 1024;
const maxStudioEntryCssBytes = 865 * 1024;

if (!fs.existsSync(htmlPath)) {
  console.error('dist/studio.html is missing. Run npm run build:studio before checking the /studio/ asset base.');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const hasStudioAssetBase = html.includes('/studio/studio-assets/');
const hasRootAssetBase = /["']\/studio-assets\//.test(html);

if (!hasStudioAssetBase || hasRootAssetBase) {
  console.error([
    'Studio subpath build check failed.',
    'Expected built assets to use /studio/studio-assets/.',
    'The old /studio-assets/ root path causes /studio/ deployments to load HTML fallbacks or 404 assets.',
    '',
    html
  ].join('\n'));
  process.exit(1);
}

const studioEntryMatch = html.match(/<script[^>]+src=["']\/studio\/studio-assets\/(studio-[^"']+\.js)["']/);
if (!studioEntryMatch) {
  console.error([
    'Studio entry chunk check failed.',
    'Expected dist/studio.html to reference a /studio/studio-assets/studio-*.js entry chunk.',
    '',
    html
  ].join('\n'));
  process.exit(1);
}

const studioEntryPath = path.join(root, 'dist', 'studio-assets', studioEntryMatch[1]);
if (!fs.existsSync(studioEntryPath)) {
  console.error(`Studio entry chunk is missing: ${studioEntryPath}`);
  process.exit(1);
}

const studioEntryBytes = fs.statSync(studioEntryPath).size;
if (studioEntryBytes > maxStudioEntryBytes) {
  console.error([
    'Studio entry chunk budget failed.',
    `Expected ${studioEntryMatch[1]} to be <= ${maxStudioEntryBytes} bytes.`,
    `Actual: ${studioEntryBytes} bytes.`,
    'Keep first-screen-only code in the entry chunk; lazy-load gallery, settings, mask, and modal surfaces.'
  ].join('\n'));
  process.exit(1);
}

const studioCssMatch = html.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']\/studio\/studio-assets\/(studio-[^"']+\.css)["']/);
if (!studioCssMatch) {
  console.error([
    'Studio entry CSS check failed.',
    'Expected dist/studio.html to reference a /studio/studio-assets/studio-*.css stylesheet.',
    '',
    html
  ].join('\n'));
  process.exit(1);
}

const studioAssetsDir = path.join(root, 'dist', 'studio-assets');
const studioEntryCssPath = path.join(studioAssetsDir, studioCssMatch[1]);
if (!fs.existsSync(studioEntryCssPath)) {
  console.error(`Studio entry CSS is missing: ${studioEntryCssPath}`);
  process.exit(1);
}

const studioEntryCssBytes = fs.statSync(studioEntryCssPath).size;
if (studioEntryCssBytes > maxStudioEntryCssBytes) {
  console.error([
    'Studio entry CSS budget failed.',
    `Expected ${studioCssMatch[1]} to be <= ${maxStudioEntryCssBytes} bytes.`,
    `Actual: ${studioEntryCssBytes} bytes.`,
    'Keep non-first-screen CSS in lazy component chunks.'
  ].join('\n'));
  process.exit(1);
}

const cssAssets = fs.readdirSync(studioAssetsDir)
  .filter((file) => file.endsWith('.css'))
  .map((file) => ({
    file,
    body: fs.readFileSync(path.join(studioAssetsDir, file), 'utf8')
  }));
const mainCss = cssAssets.find((asset) => asset.file === studioCssMatch[1]);
const lazyCssAssets = cssAssets.filter((asset) => asset.file !== studioCssMatch[1]);

function assertLazyCssSelector(selector, label) {
  if (mainCss?.body.includes(selector)) {
    console.error([
      'Studio lazy CSS split check failed.',
      `${label} styles are present in the first-screen CSS asset ${studioCssMatch[1]}.`,
      'Move that selector back into a lazy component stylesheet.'
    ].join('\n'));
    process.exit(1);
  }

  if (!lazyCssAssets.some((asset) => asset.body.includes(selector))) {
    console.error([
      'Studio lazy CSS split check failed.',
      `${label} styles were not found in any lazy CSS asset.`,
      `Looked for selector fragment: ${selector}`
    ].join('\n'));
    process.exit(1);
  }
}

assertLazyCssSelector('settingsOverlay', 'Provider/settings');
assertLazyCssSelector('galleryWorkspacePanel.inspirationWorkspace', 'Gallery workspace');
assertLazyCssSelector('regenerateDialogBackdrop', 'Regenerate dialog');

console.log([
  'Studio subpath build asset base check passed.',
  `Entry chunk: ${studioEntryBytes} bytes.`,
  `Entry CSS: ${studioEntryCssBytes} bytes.`
].join(' '));

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const studioEntry = path.join(root, 'src/studio.jsx');
const cssFiles = [
  'src/studio.css',
  'src/styles/studio.left-rail.css',
  'src/styles/studio.composer-final-guards.css',
  'src/styles/studio.composer-shell.css',
  'src/styles/studio.queue-progress.css',
  'src/styles/studio.composer-layout.css',
  'src/styles/studio.reference-panel.css',
  'src/styles/studio.composer-conversation.css',
  'src/styles/studio.provider-settings.css',
  'src/styles/studio.interactions.css',
  'src/styles/studio.gallery-cards.css',
  'src/styles/studio.final-state.css'
];
const expectedCssImports = [
  './studio.css',
  './styles/studio.left-rail.css',
  './styles/studio.composer-final-guards.css',
  './styles/studio.composer-shell.css',
  './styles/studio.queue-progress.css',
  './styles/studio.composer-layout.css',
  './styles/studio.reference-panel.css',
  './styles/studio.composer-conversation.css',
  './styles/studio.provider-settings.css',
  './styles/studio.interactions.css',
  './styles/studio.gallery-cards.css',
  './styles/studio.final-state.css'
];
const cssBudgets = {
  'src/studio.css': {
    lines: 18025,
    important: 3630
  },
  'src/styles/studio.composer-final-guards.css': {
    lines: 515,
    important: 290
  },
  'src/styles/studio.provider-settings.css': {
    lines: 470,
    important: 70
  },
  'src/styles/studio.interactions.css': {
    lines: 300,
    important: 70
  },
  'src/styles/studio.final-state.css': {
    lines: 250,
    important: 145
  }
};
const selectorOwnership = [
  {
    file: 'src/studio.css',
    pattern: /\.canvasQueue/,
    message: 'Canvas queue styles belong in src/styles/studio.queue-progress.css.'
  },
  {
    file: 'src/studio.css',
    pattern: /\.(settingsOverlay|settingsDialog|providerSummary|manualFields|keyList|legacyProviderToggle|providerChoiceGrid|providerSettingsGroup|settingsCallConfig|settingsModelSync)/,
    message: 'Provider/settings styles belong in src/styles/studio.provider-settings.css.'
  }
];

function readText(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function countMatches(body, pattern) {
  return Array.from(body.matchAll(pattern)).length;
}

function collectSelectors(body) {
  return Array.from(body.matchAll(/([^{}]+)\{/g))
    .flatMap((match) => {
      const prelude = match[1].trim();
      if (!prelude || prelude.startsWith('@')) return [];
      return prelude
        .split(',')
        .map((selector) => selector.trim())
        .filter(Boolean);
    });
}

const entryBody = readText('src/studio.jsx');
const cssImports = Array.from(entryBody.matchAll(/import\s+['"](.+?\.css)['"];?/g)).map((match) => match[1]);
const baseImportIndex = cssImports.indexOf('./studio.css');
const failures = [];

if (baseImportIndex === -1) {
  failures.push('src/studio.jsx must import ./studio.css.');
}

expectedCssImports.forEach((expectedImport, expectedIndex) => {
  const actualIndex = cssImports.indexOf(expectedImport);
  if (actualIndex === -1) {
    failures.push(`src/studio.jsx must import ${expectedImport}.`);
    return;
  }
  if (actualIndex !== expectedIndex) {
    failures.push(`${expectedImport} must be CSS import #${expectedIndex + 1}.`);
  }
});

if (cssImports.length !== expectedCssImports.length) {
  failures.push(`src/studio.jsx should have ${expectedCssImports.length} CSS imports, found ${cssImports.length}.`);
}

const selectorCounts = new Map();
const report = cssFiles.map((file) => {
  if (!fs.existsSync(path.join(root, file))) {
    failures.push(`Missing CSS file: ${file}`);
    return null;
  }

  const body = readText(file);
  const selectors = collectSelectors(body);
  selectors.forEach((selector) => {
    selectorCounts.set(selector, (selectorCounts.get(selector) || 0) + 1);
  });

  const item = {
    file,
    lines: body.split(/\r?\n/).length,
    rules: selectors.length,
    important: countMatches(body, /!important/g),
    mobileMedia: countMatches(body, /@media\s*\(max-width:\s*760px\)/g)
  };

  const budget = cssBudgets[file];
  if (budget?.lines && item.lines > budget.lines) {
    failures.push(`${file} has ${item.lines} lines, above the current debt ceiling of ${budget.lines}. Move styles into owned modules instead of growing the base file.`);
  }
  if (budget?.important && item.important > budget.important) {
    failures.push(`${file} has ${item.important} !important rules, above the current debt ceiling of ${budget.important}.`);
  }

  selectorOwnership
    .filter((rule) => rule.file === file)
    .forEach((rule) => {
      if (rule.pattern.test(body)) {
        failures.push(`${rule.message} Found forbidden selector pattern ${rule.pattern} in ${file}.`);
      }
    });

  return item;
}).filter(Boolean);

const duplicateSelectors = Array.from(selectorCounts.entries())
  .filter(([, count]) => count > 4)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([selector, count]) => ({ selector, count }));

console.log(JSON.stringify({
  cssImports,
  files: report,
  duplicateSelectors
}, null, 2));

if (failures.length) {
  console.error(`CSS cascade map check failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

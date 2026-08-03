import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  CONTRACT_VERSION,
  contractSchemas,
  validateContract,
} from '../index.js';

const packageRoot = new URL('../', import.meta.url);
const schemasUrl = new URL('schemas/', packageRoot);

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, packageRoot), 'utf8'));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function resolvePointer(document, fragment) {
  if (!fragment) {
    return document;
  }
  assert(fragment.startsWith('/'), `unsupported JSON pointer #${fragment}`);
  return fragment
    .slice(1)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((current, part) => current?.[part], document);
}

function checkReferences(node, sourceFilename, schemasByFilename) {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (typeof node.$ref === 'string') {
    const [documentReference, fragment = ''] = node.$ref.split('#', 2);
    const targetFilename = documentReference || sourceFilename;
    const target = schemasByFilename.get(targetFilename);
    assert(target, `${sourceFilename} has unresolved schema document ${documentReference}`);
    assert(resolvePointer(target, fragment), `${sourceFilename} has unresolved reference ${node.$ref}`);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach((item) => checkReferences(item, sourceFilename, schemasByFilename));
    } else if (value && typeof value === 'object') {
      checkReferences(value, sourceFilename, schemasByFilename);
    }
  }
}

function checkSchemas() {
  const filenames = readdirSync(schemasUrl).filter((name) => name.endsWith('.schema.json'));
  const schemasByFilename = new Map(
    filenames.map((filename) => [filename, readJson(`schemas/${filename}`)]),
  );
  const ids = new Set();

  for (const [filename, schema] of schemasByFilename) {
    assert(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', `${filename} must use JSON Schema 2020-12`);
    assert(typeof schema.$id === 'string' && schema.$id.length > 0, `${filename} must define $id`);
    assert(typeof schema.title === 'string' && schema.title.length > 0, `${filename} must define title`);
    assert(!ids.has(schema.$id), `${filename} duplicates schema id ${schema.$id}`);
    ids.add(schema.$id);
    checkReferences(schema, filename, schemasByFilename);
  }

  const expectedNames = [
    'Project',
    'Scene',
    'Shot',
    'Asset',
    'PromptRevision',
    'GenerationJob',
    'LineageEdge',
    'ProviderConnection',
    'JobEvent',
  ];
  assert(
    JSON.stringify(Object.keys(contractSchemas)) === JSON.stringify(expectedNames),
    'public schema exports do not match the required contract set',
  );
}

function checkFixtures() {
  const validCases = readJson('fixtures/valid/contracts.json');
  const invalidCases = readJson('fixtures/invalid/contracts.json');
  const representedSchemas = new Set();

  for (const [index, fixture] of validCases.entries()) {
    const result = validateContract(fixture.schema, fixture.data);
    assert(
      result.valid,
      `valid fixture ${index} (${fixture.schema}) failed: ${JSON.stringify(result.errors)}`,
    );
    representedSchemas.add(fixture.schema);
  }

  for (const schemaName of Object.keys(contractSchemas)) {
    assert(representedSchemas.has(schemaName), `missing valid fixture for ${schemaName}`);
  }

  for (const fixture of invalidCases) {
    const result = validateContract(fixture.schema, fixture.data);
    assert(!result.valid, `invalid fixture passed: ${fixture.name}`);
  }

  return { valid: validCases.length, invalid: invalidCases.length };
}

function checkPackage() {
  const packageJson = readJson('package.json');
  const packageContractVersion = packageJson.version.split('.').slice(0, 2).join('.');
  assert(packageContractVersion === CONTRACT_VERSION, 'package and contract major/minor versions must match');
  assert(Object.keys(packageJson.dependencies || {}).length === 0, 'runtime dependencies are not allowed');
  assert(Object.keys(packageJson.devDependencies || {}).length === 0, 'development dependencies are not allowed');

  for (const file of ['index.js', 'validator.js', 'scripts/check.mjs']) {
    execFileSync(process.execPath, ['--check', fileURLToPath(new URL(file, packageRoot))], { stdio: 'pipe' });
  }
}

checkPackage();
checkSchemas();
const fixtureCounts = checkFixtures();

console.log(
  `contracts check passed: ${Object.keys(contractSchemas).length} schemas, `
  + `${fixtureCounts.valid} valid fixtures, ${fixtureCounts.invalid} invalid fixtures`,
);

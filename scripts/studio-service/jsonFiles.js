import fs from 'node:fs/promises';
import path from 'node:path';

function findRootJsonEnd(value) {
  const raw = String(value || '').replace(/^\uFEFF/, '');
  let inString = false;
  let escape = false;
  let depth = 0;
  let rootClose = '';

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (!rootClose) {
      if (/\s/.test(char)) continue;
      if (char === '{' || char === '[') {
        depth = 1;
        rootClose = char === '{' ? '}' : ']';
        continue;
      }
      return -1;
    }
    if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0 && char === rootClose) return index + 1;
    }
  }

  return -1;
}

export function parseJsonText(value) {
  const raw = String(value || '').replace(/^\uFEFF/, '');
  try {
    return JSON.parse(raw);
  } catch (error) {
    const end = findRootJsonEnd(raw);
    if (end > 0 && raw.slice(end).trim()) {
      return JSON.parse(raw.slice(0, end));
    }
    throw error;
  }
}

export async function atomicWriteFile(filePath, data, options = {}) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const fileName = path.basename(filePath);
  const tempPath = path.join(directory, `.${fileName}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  try {
    await fs.writeFile(tempPath, data, { mode: options.mode ?? 0o640 });
    // Windows can briefly deny replacement while a reader/scanner holds the target.
    // Retry the same completed temp file; never repeat the upstream operation.
    for (let attempt = 0; ; attempt += 1) {
      try {
        await fs.rename(tempPath, filePath);
        break;
      } catch (error) {
        if (process.platform !== 'win32' || error.code !== 'EPERM' || attempt >= 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
      }
    }
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function atomicWriteJson(filePath, value, options = {}) {
  const space = options.space ?? 2;
  const suffix = options.trailingNewline === false ? '' : '\n';
  await atomicWriteFile(filePath, `${JSON.stringify(value, null, space)}${suffix}`, options);
}

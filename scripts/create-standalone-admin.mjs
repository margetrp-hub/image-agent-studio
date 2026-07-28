import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServiceConfig } from './studio-service/config.js';
import { createStandaloneAuthStore } from './studio-service/standaloneAuth.js';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log('Usage: node scripts/create-standalone-admin.mjs --email EMAIL --username NAME [--password-file PATH] [--database PATH]');
  console.log('Without --password-file, the password is read from stdin. Password arguments and password environment variables are not accepted.');
  process.exit(0);
}

const email = String(args.email || process.env.STUDIO_ADMIN_EMAIL || '').trim();
const username = String(args.username || process.env.STUDIO_ADMIN_USERNAME || '').trim();
if (!email || !username) throw new Error('Both --email and --username are required.');

const config = createServiceConfig({ scriptsDir });
const databasePath = path.resolve(args.database || config.AUTH_DATABASE_PATH);
const password = await readPassword(args.passwordFile);
const store = createStandaloneAuthStore({
    databasePath,
    sessionTtlMs: config.AUTH_SESSION_TTL_MS,
    passwordIterations: config.AUTH_PASSWORD_ITERATIONS,
    minimumPasswordLength: config.AUTH_PASSWORD_MIN_LENGTH,
  loginMaxFailures: config.AUTH_LOGIN_MAX_FAILURES,
  loginFailureWindowMs: config.AUTH_LOGIN_FAILURE_WINDOW_MS
});

try {
  const user = store.createUser({ email, username, password, role: 'admin' });
  store.secureDatabaseFiles();
  console.log(JSON.stringify({ ok: true, databasePath, user }, null, 2));
} finally {
  store.close();
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === '--help' || value === '-h') {
      parsed.help = true;
      continue;
    }
    const names = {
      '--email': 'email',
      '--username': 'username',
      '--password-file': 'passwordFile',
      '--database': 'database'
    };
    const name = names[value];
    if (!name || !values[index + 1]) throw new Error(`Unknown or incomplete argument: ${value}`);
    parsed[name] = values[index + 1];
    index += 1;
  }
  return parsed;
}

async function readPassword(passwordFile) {
  let raw;
  if (passwordFile) {
    const resolved = path.resolve(passwordFile);
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) throw new Error('The password file must be a regular file.');
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
      throw new Error('The password file must not be readable or writable by group or other users (chmod 600).');
    }
    raw = await fs.readFile(resolved, 'utf8');
  } else {
    if (process.stdin.isTTY) {
      throw new Error('Provide --password-file PATH or pipe the password over stdin.');
    }
    raw = await readStdin(16 * 1024);
  }
  return String(raw).replace(/\r?\n$/, '');
}

async function readStdin(maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Password input is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

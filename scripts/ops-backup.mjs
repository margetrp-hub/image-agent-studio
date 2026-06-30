import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = String(process.env.STUDIO_HISTORY_BASE_URL || process.env.STUDIO_API_BASE_URL || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const token = process.env.STUDIO_BACKUP_TOKEN || process.env.STUDIO_API_TOKEN || process.env.STUDIO_AUTH_TOKEN || '';
const outputDir = path.resolve(process.env.STUDIO_BACKUP_DIR || 'backups');

if (!token) {
  throw new Error('Set STUDIO_BACKUP_TOKEN before running backup.');
}

const response = await fetch(`${baseUrl}/studio-api/backup`, {
  headers: { Authorization: `Bearer ${token}` }
});
const text = await response.text();
if (!response.ok) {
  throw new Error(`Backup failed: HTTP ${response.status}\n${text.slice(0, 1000)}`);
}

let payload;
try {
  payload = JSON.parse(text);
} catch {
  throw new Error(`Backup response was not JSON.\n${text.slice(0, 1000)}`);
}

await fs.mkdir(outputDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const filePath = path.join(outputDir, `image-agent-studio-backup-${stamp}.json`);
await fs.writeFile(filePath, JSON.stringify(payload, null, 2));

console.log(JSON.stringify({
  ok: true,
  filePath,
  counts: payload.counts || {},
  serviceVersion: payload.serviceVersion || ''
}, null, 2));

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-image-workbench-backup-'));
const port = 18870 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const token = 'backup-restore-smoke-token';

function startService() {
  return spawn(process.execPath, ['scripts/image-sub2api-studio-history-service.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      STUDIO_AUTH_MODE: 'local',
      STUDIO_HISTORY_HOST: '127.0.0.1',
      STUDIO_HISTORY_PORT: String(port),
      STUDIO_DATA_DIR: tmpDir,
      STUDIO_ALLOWED_ORIGINS: baseUrl
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/studio-api/health`);
      const payload = await response.json();
      if (payload.ok) return payload;
    } catch {
      // Keep waiting until the service starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Timed out waiting for history service health.');
}

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}/studio-api${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(`API failed: ${pathname}\n${JSON.stringify({ status: response.status, payload }, null, 2)}`);
  }
  return payload;
}

const service = startService();
let stderr = '';
service.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  const health = await waitForHealth();
  await api('/session', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: 'backup-smoke-session',
      prompt: 'Backup restore smoke',
      canvasNodes: [{
        id: 'backup-smoke-node',
        canvasIndex: 1,
        kind: 'image',
        url: 'data:image/png;base64,iVBORw0KGgo=',
        prompt: 'Backup asset smoke'
      }],
      generationQueue: [{
        id: 'backup-smoke-task',
        status: 'unknown',
        prompt: 'Backup queued task'
      }]
    })
  });
  await api('/history', {
    method: 'POST',
    body: JSON.stringify({
      id: 'backup-smoke-history',
      mode: 'image',
      prompt: 'Backup history smoke',
      resultUrls: ['data:image/png;base64,iVBORw0KGgo=']
    })
  });
  await api('/community-prompts', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Backup community prompt',
      prompt: 'A recoverable community prompt used by the backup smoke test.',
      category: 'smoke',
      visibility: 'private'
    })
  });

  const backupResponse = await fetch(`${baseUrl}/studio-api/backup`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const backup = await backupResponse.json();
  if (!backupResponse.ok || backup.ok !== true) {
    throw new Error(`Backup export failed.\n${JSON.stringify(backup, null, 2)}`);
  }
  if (backup.counts.records !== 1 || !backup.counts.hasSession || backup.counts.assets < 1) {
    throw new Error(`Backup counts were wrong.\n${JSON.stringify(backup.counts, null, 2)}`);
  }
  if (backup.counts.communityPrompts !== 1 || backup.data?.communityPrompts?.[0]?.title !== 'Backup community prompt') {
    throw new Error(`Backup did not include community prompts.\n${JSON.stringify(backup.counts, null, 2)}`);
  }

  await api('/history', { method: 'DELETE' });
  await api('/session', { method: 'DELETE' });
  const userDir = path.join(tmpDir, 'users');
  const userKeys = await fs.readdir(userDir);
  await fs.rm(path.join(userDir, userKeys[0], 'community-prompts.json'), { force: true });

  const restore = await api('/backup/restore', {
    method: 'POST',
    body: JSON.stringify(backup)
  });
  const restoredSession = await api('/session?sessionId=backup-smoke-session');
  const restoredHistory = await api('/history');
  const restoredPrompts = await api('/community-prompts');

  if (restore.counts.records !== 1 || restoredSession.session?.sessionId !== 'backup-smoke-session') {
    throw new Error(`Restore did not bring the session back.\n${JSON.stringify({ restore, restoredSession }, null, 2)}`);
  }
  if (restoredHistory.records?.[0]?.id !== 'backup-smoke-history') {
    throw new Error(`Restore did not bring history back.\n${JSON.stringify(restoredHistory, null, 2)}`);
  }
  if (restore.counts.communityPrompts !== 1 || restoredPrompts.items?.[0]?.title !== 'Backup community prompt') {
    throw new Error(`Restore did not bring community prompts back.\n${JSON.stringify({ restore, restoredPrompts }, null, 2)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    health,
    backupCounts: backup.counts,
    restoreCounts: restore.counts,
    preRestoreBackup: restore.preRestoreBackup
  }, null, 2));
} finally {
  service.kill('SIGTERM');
  await fs.rm(tmpDir, { recursive: true, force: true });
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
}

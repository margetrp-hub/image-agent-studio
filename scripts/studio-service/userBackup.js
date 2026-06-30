import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWriteJson } from './jsonFiles.js';
import { text } from './text.js';
import { readAssetSnapshot, restoreAssetSnapshot } from './assetSnapshots.js';

export function createUserBackupService({
  serviceVersion,
  ensureUserDirs,
  backupsDir,
  sessionPath,
  sessionsDir,
  readRecords,
  writeRecords,
  readSessionSnapshot,
  writeSession,
  readJobs,
  writeJobs,
  readCommunityPrompts,
  writeCommunityPrompts
}) {
  async function buildUserBackup(auth, reason = 'manual') {
    const [records, sessionSnapshot, jobs, communityPrompts, assets] = await Promise.all([
      readRecords(auth),
      readSessionSnapshot(auth),
      readJobs(auth),
      readCommunityPrompts(auth),
      readAssetSnapshot(auth)
    ]);
    return {
      ok: true,
      kind: 'image-agent-studio.user-backup',
      legacyKind: 'ai-image-workbench.user-backup',
      version: 1,
      serviceVersion,
      createdAt: new Date().toISOString(),
      reason,
      user: {
        id: auth.user?.id || auth.user?.user?.id || auth.user?.email || auth.user?.username || auth.userKey,
        key: auth.userKey
      },
      counts: {
        records: records.length,
        jobs: jobs.length,
        communityPrompts: communityPrompts.length,
        assets: assets.length,
        hasSession: Boolean(sessionSnapshot.legacy) || sessionSnapshot.sessions.length > 0,
        sessions: sessionSnapshot.sessions.length
      },
      data: {
        records,
        session: sessionSnapshot.legacy,
        sessions: sessionSnapshot.sessions,
        jobs,
        communityPrompts,
        assets
      }
    };
  }

  async function saveUserBackup(auth, reason = 'pre-restore') {
    await fs.mkdir(backupsDir(auth), { recursive: true });
    const backup = await buildUserBackup(auth, reason);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${stamp}-${reason}.json`;
    const filePath = path.join(backupsDir(auth), fileName);
    await atomicWriteJson(filePath, backup);
    return { fileName, filePath, backup };
  }

  function validateUserBackup(payload) {
    if (!payload || typeof payload !== 'object') {
      const error = new Error('BACKUP_PAYLOAD_REQUIRED');
      error.status = 400;
      throw error;
    }
    const supportedKinds = new Set(['image-agent-studio.user-backup', 'ai-image-workbench.user-backup']);
    if (!supportedKinds.has(payload.kind) || payload.version !== 1) {
      const error = new Error('BACKUP_FORMAT_UNSUPPORTED');
      error.status = 400;
      throw error;
    }
    const data = payload.data || {};
    return {
      records: Array.isArray(data.records) ? data.records : [],
      session: data.session && typeof data.session === 'object' ? data.session : null,
      sessions: Array.isArray(data.sessions) ? data.sessions.filter((session) => session && typeof session === 'object') : [],
      jobs: Array.isArray(data.jobs) ? data.jobs : [],
      communityPrompts: Array.isArray(data.communityPrompts) ? data.communityPrompts : [],
      assets: Array.isArray(data.assets) ? data.assets : []
    };
  }

  async function restoreUserBackup(auth, payload) {
    const snapshot = validateUserBackup(payload);
    const preRestore = await saveUserBackup(auth, 'pre-restore');
    await ensureUserDirs(auth);
    await writeRecords(auth, snapshot.records);
    if (snapshot.session) {
      await writeSession(auth, snapshot.session);
    } else {
      await fs.rm(sessionPath(auth), { force: true });
    }
    await fs.rm(sessionsDir(auth), { recursive: true, force: true });
    for (const session of snapshot.sessions) {
      const sessionId = text(session.sessionId, 120);
      if (sessionId) await writeSession(auth, session, sessionId);
    }
    await writeJobs(auth, snapshot.jobs);
    await writeCommunityPrompts(auth, snapshot.communityPrompts);
    await restoreAssetSnapshot(auth, snapshot.assets);
    return {
      ok: true,
      restoredAt: new Date().toISOString(),
      preRestoreBackup: preRestore.fileName,
      counts: {
        records: snapshot.records.length,
        jobs: snapshot.jobs.length,
        communityPrompts: snapshot.communityPrompts.length,
        assets: snapshot.assets.length,
        hasSession: Boolean(snapshot.session) || snapshot.sessions.length > 0,
        sessions: snapshot.sessions.length
      }
    };
  }

  return {
    buildUserBackup,
    saveUserBackup,
    validateUserBackup,
    restoreUserBackup
  };
}

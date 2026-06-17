import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { atomicWriteJson } from './jsonFiles.js';
import { text } from './text.js';

export function sanitizeCommunityPrompt(value, fallback = {}) {
  const createdAt = text(value?.createdAt || fallback.createdAt || new Date().toISOString(), 60);
  const prompt = text(value?.prompt, 12000);
  const title = text(value?.title || prompt.slice(0, 80) || 'Untitled prompt', 160);
  const category = text(value?.category || 'Community Prompts', 120);
  const id = text(value?.id || fallback.id || `share-${randomUUID()}`, 120);
  const reactions = value?.reactions && typeof value.reactions === 'object' ? value.reactions : {};
  const up = Math.max(0, Number(reactions.up || value?.up || 0));
  const down = Math.max(0, Number(reactions.down || value?.down || 0));
  return {
    id,
    kind: 'community-prompt',
    title,
    prompt,
    promptPreview: text(value?.promptPreview || prompt, 800),
    category,
    sourceName: text(value?.sourceName || 'User shared', 120),
    note: text(value?.note || '', 800),
    tags: Array.isArray(value?.tags) ? value.tags.slice(0, 8).map((item) => text(item, 40)).filter(Boolean) : [],
    visibility: value?.visibility === 'private' ? 'private' : 'workspace',
    createdAt,
    updatedAt: text(value?.updatedAt || createdAt, 60),
    reactions: { up, down },
    copied: Math.max(0, Number(value?.copied || 0)),
    shared: Math.max(0, Number(value?.shared || 0)),
    userReaction: ['up', 'down'].includes(value?.userReaction) ? value.userReaction : ''
  };
}

export function createCommunityPromptStore({ ensureUserDirs, communityPromptsPath, parseJsonText, limit }) {
  async function readCommunityPrompts(auth) {
    try {
      const raw = await fs.readFile(communityPromptsPath(auth), 'utf8');
      const parsed = parseJsonText(raw);
      const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
      return items.map((item) => sanitizeCommunityPrompt(item)).filter((item) => item.prompt);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async function writeCommunityPrompts(auth, items) {
    await ensureUserDirs(auth);
    const nextItems = items
      .map((item) => sanitizeCommunityPrompt(item))
      .filter((item) => item.prompt)
      .slice(0, limit);
    await atomicWriteJson(communityPromptsPath(auth), { items: nextItems });
    return nextItems;
  }

  return {
    readCommunityPrompts,
    writeCommunityPrompts
  };
}

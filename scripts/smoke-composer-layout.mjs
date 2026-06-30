import { chromium } from 'playwright';
import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';

const screenshotDir = 'D:/wiki/image-sub2api-studio/output/playwright';
const fixtureDir = `${screenshotDir}/fixtures`;
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAQAAAAAYLlVAAAAWElEQVR42u3OQQ0AAAgDMMTrf2YKBhhoKrQydc1wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgOwQ0AAEEp43RAAAAAElFTkSuQmCC';
const layoutKey = 'image-sub2api-studio:workbench-layout:v6';
const sessionKey = 'image-sub2api-studio:current-session:v1';

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
}

function rectOverlap(a, b) {
  if (!a || !b) return 0;
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
  return x * y;
}

async function writeFixtures() {
  await fs.mkdir(fixtureDir, { recursive: true });
  const files = [
    path.join(fixtureDir, 'composer-reference-a.png'),
    path.join(fixtureDir, 'composer-reference-b.png')
  ];
  await Promise.all(files.map((file) => fs.writeFile(file, Buffer.from(pngBase64, 'base64'))));
  return files;
}

function seedSession({ liveStatus = false } = {}) {
  const startedAt = Date.now() - 112000;
  return {
    sessionId: 'composer-layout-session',
    mode: 'image',
    status: liveStatus ? 'loading' : 'idle',
    message: liveStatus ? '上游还没有返回数据，可能正在排队或生成较慢，请继续等待。' : '',
    progress: liveStatus
      ? { stage: 'upstream', percent: 52, completed: 0, total: 1 }
      : { stage: 'idle', percent: 0, completed: 0, total: 1 },
    timing: liveStatus
      ? {
        status: 'running',
        startedAt,
        firstByteAt: null,
        completedAt: null,
        model: 'gpt-image-2',
        spec: '1024x1024 · high · 1K'
      }
      : null,
    prompt: 'Continue the product image with cleaner reflections and a warmer background.',
    model: 'gpt-image-2',
    assistantMessages: [
      {
        id: 'composer-layout-user',
        role: 'user',
        content: 'I want to continue this image without returning to the old composition.',
        pending: false,
        failed: false
      },
      {
        id: 'composer-layout-assistant',
        role: 'assistant',
        content: 'Keep the main object, then refine local lighting, background depth, and product edges.',
        finalPrompt: 'Subject: refined product hero image\n\nChange: keep the object, simplify background, add warm reflection control.',
        pending: false,
        failed: false
      }
    ],
    promptSuggestion: {
      subject: 'Keep the original product shape and material surface.',
      scene: 'Move the scene toward a clean studio desk with warmer background depth.',
      composition: 'Keep the object centered, leave room for subtle reflection below.',
      style: 'Premium product photography, soft contrast, restrained highlights.',
      lighting: 'Warm side light, controlled rim highlight, no harsh glare.',
      details: 'Refine edges, remove noisy artifacts, keep the label readable.',
      finalPrompt: [
        'Subject: Keep the original product shape, material texture, and core silhouette.',
        'Scene: Place it in a clean studio desk environment with warmer background depth.',
        'Composition: Centered product hero image with subtle reflection below and enough breathing room.',
        'Style: Premium product photography, soft contrast, controlled highlights, no extra props.'
      ].join('\n')
    },
    generationQueue: liveStatus ? [
      {
        id: 'remote-job-live-status',
        status: 'running',
        serverJobId: 'job-live-status',
        prompt: 'A live generation should report status above the chat thread.',
        summary: 'A live generation should report status above the chat thread.',
        model: 'gpt-image-2',
        size: '1024x1024',
        quality: 'high',
        count: 1,
        remote: true,
        restorable: false,
        stage: 'upstream',
        completed: 0,
        total: 1
      }
    ] : [
      {
        id: 'composer-layout-queue',
        status: 'unknown',
        prompt: 'A recovered generation should remain visible without squeezing the composer.',
        summary: 'A recovered generation should remain visible without squeezing the composer.',
        model: 'gpt-image-2',
        size: '1024x1024',
        quality: 'high',
        count: 1,
        remote: true,
        restorable: false
      }
    ],
    canvasNodes: [
      {
        id: 'node-1',
        canvasIndex: 1,
        x: 220,
        y: 160,
        width: 220,
        height: 220,
        prompt: 'Subject: original product image',
        url: ''
      }
    ]
  };
}

async function installRoutes(page) {
  const liveJob = {
    id: 'job-live-status',
    status: 'upstream',
    stage: 'upstream',
    sessionId: 'composer-layout-session',
    prompt: 'A live generation should report status above the chat thread.',
    model: 'gpt-image-2',
    size: '1024x1024',
    quality: 'high',
    count: 1,
    total: 1,
    completed: 0,
    resultUrls: []
  };
  await page.route('**/studio-api/library**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, categories: [], styles: [], scenes: [], cases: [] })
  }));
  await page.route('**/studio-api/history**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, records: [], total: 0, nextOffset: null })
  }));
  await page.route('**/studio-api/session', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, session: null })
  }));
  await page.route('**/studio-api/generation-jobs/job-live-status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, job: liveJob })
  }));
  await page.route('**/studio-api/generation-jobs**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, jobs: [] })
  }));
}

async function runScenario(browser, baseUrl, files, viewport, name, options = {}) {
  const page = await browser.newPage({ viewport });
  const referencesOpen = options.referencesOpen ?? name !== 'mobile';
  const liveStatus = options.liveStatus === true;
  await installRoutes(page);
  await page.addInitScript(({ layoutKey, sessionKey, session, referencesOpen }) => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.setItem(layoutKey, JSON.stringify({
      prompt: false,
      references: referencesOpen,
      parameters: true,
      parametersRail: false,
      bottomComposer: true,
      composerParameters: false
    }));
    localStorage.setItem(sessionKey, JSON.stringify(session));
  }, { layoutKey, sessionKey, session: seedSession({ liveStatus }), referencesOpen });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.creationDesk.composerOpen', { timeout: 15000 });
  if (referencesOpen) {
    await page.locator('.referenceSidePanel input[type="file"]').first().setInputFiles(files);
    await page.waitForSelector('.referenceSideBody.hasReferenceItems .sideReferenceThumbs figure', { timeout: 8000 });
  }
  await page.waitForTimeout(500);
  const screenshotPath = `${screenshotDir}/composer-layout-${name}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = await page.evaluate(() => {
    function rect(selector) {
      const node = document.querySelector(selector);
      if (!node) return null;
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || box.width <= 0 || box.height <= 0) return null;
      return {
        selector,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        right: box.right,
        bottom: box.bottom
      };
    }
    function overlap(a, b) {
      if (!a || !b) return 0;
      const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
      const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
      return x * y;
    }
    const keys = {
      composer: '.bottomComposerBar',
      canvasToolbar: '.canvasToolbar',
      queueDock: '.canvasQueueDock',
      queueItem: '.canvasQueueItem',
      queueAction: '.canvasQueueItem button',
      head: '.composerPanelHead',
      thread: '.composerThread',
      referencePanel: '.referenceSidePanel',
      referenceFigure: '.referenceSidePanel .sideReferenceThumbs figure',
      referenceImage: '.referenceSidePanel .sideReferenceThumbs img',
      composerReferenceStrip: '.bottomComposerBar .composerReferenceStrip',
      liveStatus: '.composerLiveStatus',
      liveProgress: '.composerLiveStatus .generationProgress',
      legacyGenerationCard: '.composerThread .composerGenerationCard',
      paramSummary: '.composerParamSummary',
      userMessage: '.composerMessage.user',
      userMessageText: '.composerMessage.user p',
      assistantMessage: '.composerMessage.assistant:not(.promptSuggestion)',
      assistantMessageText: '.composerMessage.assistant:not(.promptSuggestion) p',
      prompt: '.composerPromptRow',
      params: '.composerParamShelf',
      input: '.bottomComposerInput textarea',
      actions: '.composerActionGroup',
      assistant: '.composerAssistantAction',
      generate: '.composerGenerateAction',
      suggestion: '.promptSuggestion.composerMessage',
      suggestionBody: '.promptSuggestionBody',
      suggestionLead: '.promptSuggestionLead',
      suggestionText: '.promptSuggestionText, .promptSuggestionPlain',
      suggestionActions: '.promptSuggestionActions'
    };
    const rects = Object.fromEntries(Object.entries(keys).map(([key, selector]) => [key, rect(selector)]));
    const visibleHeaderPills = Array.from(document.querySelectorAll('.composerHeaderPill')).filter((node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    }).length;
    const paramShelf = document.querySelector('.composerParamShelf');
    const paramShelfStyle = paramShelf ? getComputedStyle(paramShelf) : null;
    const paramGroups = Array.from(document.querySelectorAll('.composerParamShelf.isExpanded .composerParamGroup')).map((node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || box.width <= 0 || box.height <= 0) return null;
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        right: box.right,
        bottom: box.bottom,
        text: node.textContent.trim().slice(0, 40)
      };
    }).filter(Boolean);
    const paramChildren = Array.from(document.querySelectorAll('.composerParamShelf.isExpanded > *')).map((node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || box.width <= 0 || box.height <= 0) return null;
      return { top: box.top, height: box.height, width: box.width, text: node.textContent.trim().slice(0, 40) };
    }).filter(Boolean);
    const paramTopSpread = paramChildren.length
      ? Math.max(...paramChildren.map((item) => item.top)) - Math.min(...paramChildren.map((item) => item.top))
      : 0;
    const suggestionBodyStyle = document.querySelector('.promptSuggestionBody')
      ? getComputedStyle(document.querySelector('.promptSuggestionBody'))
      : null;
    const suggestionBodyBorderWidth = suggestionBodyStyle
      ? ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']
        .reduce((total, key) => total + Number.parseFloat(suggestionBodyStyle[key] || '0'), 0)
      : null;
    const suggestionTextSamples = Array.from(document.querySelectorAll('.promptSuggestionText span, .promptSuggestionPlain')).map((node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || box.width <= 0 || box.height <= 0) return null;
      return {
        width: box.width,
        height: box.height,
        text: node.textContent.trim().slice(0, 80),
        whiteSpace: style.whiteSpace,
        overflow: style.overflow,
        textOverflow: style.textOverflow
      };
    }).filter(Boolean);
    const suggestionActionOverlap = overlap(rects.suggestionText, rects.suggestionActions);
    const toolbarQueueOverlap = overlap(rects.canvasToolbar, rects.queueDock);
    const toolbarComposerOverlap = overlap(rects.canvasToolbar, rects.composer);
    const toolbarReferenceOverlap = overlap(rects.canvasToolbar, rects.referencePanel);
    const inputActionOverlap = overlap(rects.input, rects.actions);
    const generateAssistantOverlap = overlap(rects.generate, rects.assistant);
    const referenceComposerOverlap = overlap(rects.referencePanel, rects.composer);
    const referenceQueueOverlap = overlap(rects.referencePanel, rects.queueDock);
    const referenceFigureCount = document.querySelectorAll('.referenceSidePanel .sideReferenceThumbs figure').length;
    const referenceImageSamples = Array.from(document.querySelectorAll('.referenceSidePanel .sideReferenceThumbs img')).map((node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || box.width <= 0 || box.height <= 0) return null;
      return {
        width: box.width,
        height: box.height,
        objectFit: style.objectFit,
        opacity: Number.parseFloat(style.opacity || '1')
      };
    }).filter(Boolean);
    const sections = ['head', ...(rects.liveStatus ? ['liveStatus'] : []), 'thread', 'prompt', 'params'];
    const sectionOverlaps = [];
    for (let i = 0; i < sections.length; i += 1) {
      for (let j = i + 1; j < sections.length; j += 1) {
        const area = overlap(rects[sections[i]], rects[sections[j]]);
        if (area > 4) sectionOverlaps.push({ a: sections[i], b: sections[j], area });
      }
    }
    const outsideComposer = sections
      .filter((key) => rects[key])
      .filter((key) => {
        const box = rects[key];
        const parent = rects.composer;
        return box.x < parent.x - 1 || box.right > parent.right + 1 || box.y < parent.y - 1 || box.bottom > parent.bottom + 1;
      });
    return {
      rects,
      sectionOverlaps,
      outsideComposer,
      visibleHeaderPills,
      paramChildren,
      paramGroups,
      paramShelfMode: paramShelfStyle?.display || '',
      paramShelfOverflowX: paramShelfStyle?.overflowX || '',
      paramShelfOverflowY: paramShelfStyle?.overflowY || '',
      paramTopSpread,
      suggestionBodyBorderWidth,
      suggestionTextSamples,
      suggestionActionOverlap,
      toolbarQueueOverlap,
      toolbarComposerOverlap,
      toolbarReferenceOverlap,
      inputActionOverlap,
      generateAssistantOverlap,
      referenceComposerOverlap,
      referenceQueueOverlap,
      referenceFigureCount,
      referenceImageSamples,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      body: document.body.innerText.slice(0, 2200)
    };
  });

  assert(result.rects.composer, `${name}: composer was not visible.`, result);
  assert(result.rects.composer.x >= -1 && result.rects.composer.right <= result.viewport.width + 1, `${name}: composer escaped horizontally.`, result);
  assert(result.rects.composer.bottom <= result.viewport.height + 1, `${name}: composer bottom escaped the viewport.`, result);
  if (result.rects.canvasToolbar) {
    assert(result.rects.canvasToolbar.width >= 34 && result.rects.canvasToolbar.height >= 34, `${name}: canvas zoom toolbar became too small.`, result);
    assert(result.rects.canvasToolbar.right <= result.viewport.width + 1, `${name}: canvas zoom toolbar escaped the viewport.`, result);
    assert(result.toolbarComposerOverlap <= 4, `${name}: canvas zoom toolbar overlaps the composer panel.`, result);
    assert(result.toolbarQueueOverlap <= 4, `${name}: canvas zoom toolbar overlaps the generation queue.`, result);
  }
  if (result.viewport.width >= 1000) {
    assert(
      result.rects.composer.width >= (referencesOpen ? 700 : 820),
      `${name}: expanded composer is still too narrow for the wide workbench layout.`,
      result
    );
    assert(result.rects.composer.width <= 1080, `${name}: expanded composer became visually too wide.`, result);
  }
  if (liveStatus) {
    assert(result.rects.queueDock, `${name}: generation queue dock was not visible for active queue state.`, result);
    assert(result.rects.queueItem, `${name}: generation queue item was not visible.`, result);
    assert(result.rects.queueAction, `${name}: generation queue action button was not visible.`, result);
    assert(result.rects.queueDock.width <= (result.viewport.width >= 1000 ? 360 : 300), `${name}: generation queue dock became too wide.`, result);
    assert(rectOverlap(result.rects.queueDock, result.rects.composer) <= 4, `${name}: generation queue dock overlaps the composer panel.`, result);
    assert(result.rects.queueAction.width >= 22 && result.rects.queueAction.height >= 22, `${name}: generation queue action button became too small.`, result);
    assert(
      result.rects.queueAction.x >= result.rects.queueItem.x - 1
        && result.rects.queueAction.right <= result.rects.queueItem.right + 1
        && result.rects.queueAction.y >= result.rects.queueItem.y - 1
        && result.rects.queueAction.bottom <= result.rects.queueItem.bottom + 1,
      `${name}: generation queue action button escaped its item.`,
      result
    );
  }
  if (referencesOpen) {
    assert(result.rects.referencePanel, `${name}: right reference panel was not visible after upload.`, result);
    assert(result.referenceFigureCount >= files.length, `${name}: uploaded reference figures were not all visible.`, result);
    assert(result.referenceImageSamples.length >= files.length, `${name}: uploaded reference images were not visible.`, result);
    assert(
      result.referenceImageSamples.every((item) => item.width >= 32 && item.height >= 32 && ['cover', 'contain'].includes(item.objectFit)),
      `${name}: reference thumbnail images are too small or not fitted correctly.`,
      result
    );
    assert(result.referenceComposerOverlap <= 4, `${name}: reference panel overlaps the composer panel.`, result);
    assert(result.referenceQueueOverlap <= 4, `${name}: reference panel overlaps the generation queue.`, result);
    assert(result.toolbarReferenceOverlap <= 4, `${name}: canvas zoom toolbar overlaps the reference panel.`, result);
  }
  assert(!result.rects.composerReferenceStrip, `${name}: references should live in the right panel, not as a duplicated composer strip.`, result);
  assert(!result.rects.legacyGenerationCard, `${name}: legacy generation progress card is still rendered inside the scrollable thread.`, result);
  if (result.rects.thread) {
    const visibleMessageOptions = [
      [result.rects.assistantMessage, result.rects.assistantMessageText],
      [result.rects.userMessage, result.rects.userMessageText],
      [result.rects.suggestion, result.rects.suggestionText]
    ].filter(([message, text]) => message && text);
    const [visibleMessage, visibleMessageText] = visibleMessageOptions.find(([message]) => (
      message.y < result.rects.thread.bottom - 8 && message.bottom > result.rects.thread.y + 8
    )) || [];
    assert(visibleMessage && visibleMessageText, `${name}: no conversation message was visible in the composer thread.`, result);
    assert(
      visibleMessage.y < result.rects.thread.bottom - 8 && visibleMessage.bottom > result.rects.thread.y + 8,
      `${name}: conversation messages are not visible in the composer thread viewport.`,
      result
    );
    assert(visibleMessage.width >= Math.min(200, result.rects.thread.width - 16), `${name}: visible message collapsed into a narrow vertical bubble.`, result);
    assert(visibleMessageText.width >= Math.min(150, result.rects.thread.width - 58), `${name}: visible message text became too narrow to read horizontally.`, result);
  }
  if (liveStatus) {
    assert(result.rects.liveStatus, `${name}: live generation status bar was not visible.`, result);
    assert(result.rects.liveProgress, `${name}: live generation progress track was not visible.`, result);
    assert(
      result.rects.thread
        ? result.rects.liveStatus.y >= result.rects.head.bottom - 2 && result.rects.liveStatus.bottom <= result.rects.thread.y + 2
        : result.rects.liveStatus.y >= result.rects.head.bottom - 2,
      `${name}: live status bar is not fixed between the header and chat thread.`,
      result
    );
  } else {
    assert(!result.rects.liveStatus, `${name}: live status bar appeared when generation is idle.`, result);
  }
  assert(result.rects.prompt, `${name}: prompt row was not visible.`, result);
  assert(
    result.rects.actions.y >= result.rects.prompt.y - 1 && result.rects.actions.bottom <= result.rects.prompt.bottom + 1,
    `${name}: composer action rail escaped the prompt row.`,
    result
  );
  assert(result.rects.params, `${name}: parameter shelf was not visible.`, result);
  assert(result.rects.paramSummary, `${name}: parameter summary should remain visible in the default composer.`, result);
  assert(result.rects.params.height >= 34 && result.rects.params.height <= 52, `${name}: parameters should default to a compact summary until generate or manual edit.`, result);
  assert(result.paramGroups.length === 0, `${name}: expanded parameter controls should not be visible by default.`, result);
  assert(result.visibleHeaderPills === 0, `${name}: inactive composer header pills are still visible.`, result);
  if (result.rects.thread || result.rects.suggestion) {
    assert(result.rects.suggestion, `${name}: prompt suggestion was not visible.`, result);
    const suggestionWidthLimit = result.rects.thread ? result.rects.thread.width - 16 : result.rects.composer.width - 32;
    assert(result.rects.suggestion.width >= Math.min(260, suggestionWidthLimit), `${name}: prompt suggestion collapsed into an unreadable narrow card.`, result);
    if (result.rects.thread) {
      assert(
        result.rects.suggestion.y >= result.rects.thread.y - 1 && result.rects.suggestion.bottom <= result.rects.thread.bottom + 1,
        `${name}: current prompt suggestion escaped the visible composer thread area.`,
        result
      );
    }
    assert(result.rects.suggestionLead, `${name}: prompt suggestion lead text was not visible.`, result);
    assert(result.rects.suggestionText, `${name}: prompt suggestion text was not visible.`, result);
    assert(result.rects.suggestionActions, `${name}: prompt suggestion actions were not visible.`, result);
    assert(result.suggestionActionOverlap <= 4, `${name}: prompt suggestion actions overlap the text.`, result);
    const minSuggestionTextWidth = name.startsWith('mobile')
      ? Math.min(112, result.rects.suggestionBody.width - 36)
      : Math.min(240, result.rects.suggestionBody.width - 40);
    assert(
      result.suggestionTextSamples.length > 0 && result.suggestionTextSamples.every((item) => item.width >= minSuggestionTextWidth),
      `${name}: prompt suggestion text is clipped into tiny fragments.`,
      result
    );
    assert(result.suggestionBodyBorderWidth === 0, `${name}: prompt suggestion body still renders as a nested bordered box.`, result);
  }
  assert(result.sectionOverlaps.length === 0, `${name}: composer sections overlap.`, result);
  assert(result.outsideComposer.length === 0, `${name}: composer sections escaped the composer container.`, result);
  assert(result.rects.input.width >= 160 && result.rects.input.height >= 44, `${name}: prompt input became too small.`, result);
  assert(result.inputActionOverlap <= 4, `${name}: prompt input overlaps the action rail.`, result);
  assert(result.rects.generate.width >= 34 && result.rects.generate.height >= 34, `${name}: generate button became too small.`, result);
  assert(
    result.rects.generate.y >= result.rects.actions.y - 1 && result.rects.generate.bottom <= result.rects.actions.bottom + 1,
    `${name}: generate button escaped the action rail.`,
    result
  );
  if (result.rects.assistant) {
    assert(result.rects.assistant.width >= 32 && result.rects.assistant.height >= 32, `${name}: assistant button became too small.`, result);
    assert(result.generateAssistantOverlap <= 4, `${name}: generate and assistant buttons overlap.`, result);
    assert(
      result.rects.assistant.y >= result.rects.actions.y - 1 && result.rects.assistant.bottom <= result.rects.actions.bottom + 1,
      `${name}: assistant button escaped the action rail.`,
      result
    );
  }

  await page.close();
  return { name, screenshotPath, result };
}

async function runCloseReopenScenario(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await installRoutes(page);
  await page.addInitScript(({ layoutKey, sessionKey, session }) => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.setItem(layoutKey, JSON.stringify({
      prompt: false,
      references: false,
      parameters: true,
      parametersRail: false,
      bottomComposer: true,
      composerParameters: false,
      composerFolded: false
    }));
    localStorage.setItem(sessionKey, JSON.stringify(session));
  }, { layoutKey, sessionKey, session: seedSession() });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.bottomComposerBar.isExpandedComposer', { timeout: 15000 });

  const closeButtons = page.locator('.bottomComposerBar .composerHeaderActions .composerIconPill');
  await closeButtons.last().click();
  await page.waitForSelector('.bottomComposerBar.isFolded', { timeout: 5000 });
  const folded = await page.evaluate(() => {
    const composer = document.querySelector('.bottomComposerBar.isFolded');
    const input = document.querySelector('.bottomComposerBar.isFolded .bottomComposerInput textarea');
    const expandButton = document.querySelector('.bottomComposerBar.isFolded .composerHeaderActions .composerIconPill');
    const box = composer?.getBoundingClientRect();
    const inputBox = input?.getBoundingClientRect();
    const expandBox = expandButton?.getBoundingClientRect();
    return {
      composer: box ? { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom } : null,
      input: inputBox ? { width: inputBox.width, height: inputBox.height } : null,
      expandButton: expandBox ? { width: expandBox.width, height: expandBox.height } : null,
      body: document.body.innerText.slice(0, 1000)
    };
  });
  assert(folded.composer, 'close/reopen: X should fold the composer instead of hiding it.', folded);
  assert(folded.input?.width >= 200 && folded.input?.height >= 44, 'close/reopen: folded composer input is not usable after clicking X.', folded);
  assert(folded.expandButton?.width >= 28 && folded.expandButton?.height >= 28, 'close/reopen: folded composer has no visible expand button.', folded);

  await closeButtons.first().click();
  await page.waitForSelector('.bottomComposerBar.isExpandedComposer', { timeout: 5000 });
  const reopened = await page.evaluate(() => {
    const composer = document.querySelector('.bottomComposerBar.isExpandedComposer');
    const thread = document.querySelector('.bottomComposerBar.isExpandedComposer .composerThread');
    const box = composer?.getBoundingClientRect();
    const threadBox = thread?.getBoundingClientRect();
    return {
      composer: box ? { width: box.width, height: box.height } : null,
      thread: threadBox ? { width: threadBox.width, height: threadBox.height } : null
    };
  });
  assert(reopened.composer?.height >= 430, 'close/reopen: expand button did not restore the full composer.', reopened);
  assert(reopened.thread?.height >= 120, 'close/reopen: restored composer thread is not visible.', reopened);

  const screenshotPath = `${screenshotDir}/composer-layout-close-reopen.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await page.close();

  const hiddenPage = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await installRoutes(hiddenPage);
  await hiddenPage.addInitScript(({ layoutKey, sessionKey, session }) => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.setItem(layoutKey, JSON.stringify({
      prompt: false,
      references: false,
      parameters: true,
      parametersRail: false,
      bottomComposer: false,
      composerParameters: false,
      composerFolded: false
    }));
    localStorage.setItem(sessionKey, JSON.stringify(session));
  }, { layoutKey, sessionKey, session: seedSession() });
  await hiddenPage.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await hiddenPage.waitForSelector('.bottomComposerReopenDock', { timeout: 5000 });
  const hidden = await hiddenPage.evaluate(() => {
    const dock = document.querySelector('.bottomComposerReopenDock');
    const box = dock?.getBoundingClientRect();
    return {
      dock: box ? { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom } : null,
      label: dock?.textContent?.trim() || ''
    };
  });
  assert(hidden.dock?.width >= 220 && hidden.dock?.height >= 44, 'close/reopen: hidden composer fallback is not a visible reopen dock.', hidden);
  await hiddenPage.locator('.bottomComposerReopenDock').click();
  await hiddenPage.waitForSelector('.bottomComposerBar.isExpandedComposer', { timeout: 5000 });

  const hiddenScreenshotPath = `${screenshotDir}/composer-layout-reopen-dock.png`;
  await hiddenPage.screenshot({ path: hiddenScreenshotPath, fullPage: true });
  await hiddenPage.close();
  return { name: 'close-reopen', screenshotPath, folded, hidden, reopened };
}

const server = await createServer({
  logLevel: 'silent',
  server: {
    host: '127.0.0.1',
    port: 0,
    strictPort: false
  }
});

let browser;

try {
  const files = await writeFixtures();
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  assert(baseUrl, 'Vite smoke server did not expose a local URL.');

  browser = await chromium.launch({ headless: true });
  const scenarios = [
    await runScenario(browser, baseUrl, files, { width: 1360, height: 900 }, 'desktop'),
    await runScenario(browser, baseUrl, files, { width: 1360, height: 900 }, 'desktop-live', { liveStatus: true, referencesOpen: false }),
    await runScenario(browser, baseUrl, files, { width: 390, height: 844 }, 'mobile'),
    await runScenario(browser, baseUrl, files, { width: 390, height: 844 }, 'mobile-live', { liveStatus: true, referencesOpen: false }),
    await runCloseReopenScenario(browser, baseUrl)
  ];

  console.log(JSON.stringify({ ok: true, scenarios }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}

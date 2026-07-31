import { chromium } from 'playwright';
import { createServer } from 'vite';
import { clickGenerate, fillGenerationPrompt } from './smoke-ui-helpers.mjs';

const fakeBaseUrl = 'https://xai-route-smoke.example/v1';
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const providerSettingsKey = 'image-sub2api-studio:provider-settings:v1';
const manualSecretKey = 'image-sub2api-studio:manual-provider-secret:v1';

function assert(condition, message, evidence) {
  if (!condition) throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
}

function step(message) {
  console.log(`[xai-route-smoke] ${message}`);
}

const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0, strictPort: false } });
let browser;
try {
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  step(`vite=${baseUrl}`);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(30000);
  page.on('requestfailed', (request) => step(`requestfailed ${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));
  const requests = { models: [], images: [], videos: [], polls: [], content: [] };

  for (const path of ['library', 'history', 'session']) {
    await page.route(`**/studio-api/${path}**`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(path === 'history' ? { ok: true, records: [], total: 0, nextOffset: null } : path === 'session' ? { ok: true, session: null } : { ok: true, categories: [], styles: [], scenes: [], cases: [], videoInspirations: [] })
    }));
  }
  await page.route('**/studio-api/model-sync', (route) => {
    requests.models.push('studio-bridge');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        models: [
          { id: 'grok-imagine-image' },
          { id: 'grok-imagine-video-1.5' },
          { id: 'grok-4' }
        ]
      })
    });
  });
  await page.route('**/studio-api/generation-jobs**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'SMOKE_QUEUE_DISABLED' }) }));
  await page.route('**/api/v1/models', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ object: 'list', data: [] })
  }));
  await page.route(`${fakeBaseUrl}/models`, (route) => {
    requests.models.push(route.request().method());
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ object: 'list', data: [
        { id: 'grok-imagine-image' },
        { id: 'grok-imagine-video-1.5' },
        { id: 'grok-4' }
      ] })
    });
  });
  await page.route(`${fakeBaseUrl}/usage`, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ total: 0, requests: 0 })
  }));
  await page.route(`${fakeBaseUrl}/images/generations`, async (route) => {
    requests.images.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ url: 'https://xai-route-smoke.example/image.png' }] }) });
  });
  await page.route('https://xai-route-smoke.example/image.png', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(tinyPng, 'base64') }));
  await page.route(`${fakeBaseUrl}/videos/generations`, (route) => {
    requests.videos.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ request_id: 'xai-smoke-video-1', status: 'queued' }) });
  });
  await page.route(`${fakeBaseUrl}/videos/xai-smoke-video-1`, (route) => {
    requests.polls.push(route.request().method());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ request_id: 'xai-smoke-video-1', status: 'done', video: { url: '/v1/videos/xai-smoke-video-1/content' } }) });
  });
  await page.route(`${fakeBaseUrl}/videos/xai-smoke-video-1/content`, (route) => {
    requests.content.push(route.request().method());
    return route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.from('fake-mp4') });
  });

  await page.addInitScript(({ providerSettingsKey, manualSecretKey, fakeBaseUrl }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('image-sub2api-studio-language', 'en');
    localStorage.setItem(providerSettingsKey, JSON.stringify({
      providerId: 'xai-compatible',
      apiKeySource: 'manual',
      manualGatewayBaseUrl: fakeBaseUrl,
      route: 'auto',
      imageGenerationModel: 'grok-imagine-image',
      imageEditModel: 'grok-imagine-image',
      videoModel: 'grok-imagine-video-1.5',
      responsesModel: 'grok-4',
      partialImages: 0
    }));
    sessionStorage.setItem(manualSecretKey, 'xai-route-smoke-secret');
  }, { providerSettingsKey, manualSecretKey, fakeBaseUrl });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  step('page loaded');
  await page.waitForSelector('.creationDesk.composerOpen', { timeout: 15000 });
  step('composer ready');
  await fillGenerationPrompt(page, 'A clean Grok image route smoke test.');
  await clickGenerate(page);
  step('image confirmation opened');
  await page.locator('.generationConfirmPrimary').click();
  step('image submitted');
  await page.waitForFunction(() => document.querySelectorAll('.resultGrid img, .canvasNode img').length >= 1, null, { timeout: 15000 });
  step('image rendered');

  await page.locator('.workbenchModeSwitch button').filter({ hasText: 'Video' }).first().click();
  step('video mode selected');
  await fillGenerationPrompt(page, 'A five second Grok video route smoke test.');
  await clickGenerate(page);
  step('video confirmation opened');
  await page.locator('.generationConfirmPrimary').click();
  step('video submitted');
  await page.waitForFunction(() => document.querySelectorAll('.resultGrid video, .canvasNode video').length >= 1, null, { timeout: 20000 });
  step('video rendered');

  assert(requests.models.length >= 1, 'xAI model sync did not run.', requests);
  assert(requests.images.length === 1, 'xAI image route should be called once.', requests);
  assert(requests.images[0].model === 'grok-imagine-image', 'xAI image route used the wrong model.', requests);
  assert(requests.images[0].n === 1, 'xAI image route must request one image.', requests);
  assert(requests.images[0].prompt.startsWith('A clean Grok image route smoke test.'), 'xAI image route did not preserve the prompt.', requests);
  assert(!Object.hasOwn(requests.images[0], 'size') && !Object.hasOwn(requests.images[0], 'quality'), 'xAI image route sent unsupported image parameters.', requests);
  assert(requests.videos.length === 1, 'xAI video route should be called once.', requests);
  assert(requests.videos[0].model === 'grok-imagine-video-1.5', 'xAI video route used the wrong model.', requests);
  assert(requests.videos[0].duration === 5, 'xAI video route did not preserve duration.', requests);
  assert(requests.videos[0].prompt.includes('A five second Grok video route smoke test.'), 'xAI video route did not preserve the new request.', requests);
  assert(requests.polls.length >= 1, 'xAI video status endpoint was not polled.', requests);
  assert(requests.content.length === 1, 'xAI video content endpoint was not downloaded with auth.', requests);
  console.log(JSON.stringify({ ok: true, requests }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}

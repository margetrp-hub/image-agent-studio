import { chromium } from 'playwright';
import { clickGenerate, fillGenerationPrompt } from './smoke-ui-helpers.mjs';

const pageUrl = process.argv[2] || process.env.PUBLIC_STUDIO_URL || 'https://studio.ohlaoo.com/studio/';
const expectedJs = process.env.EXPECTED_STUDIO_JS || '';
const expectedCss = process.env.EXPECTED_STUDIO_CSS || '';
const providerSettingsKey = 'image-sub2api-studio:provider-settings:v1';
const manualSecretKey = 'image-sub2api-studio:manual-provider-secret:v1';
const fakeSecret = 'test-key-public-route-smoke';
const fakeGatewayOrigin = 'https://public-route-smoke.example';
const fakeGatewayBaseUrl = `${fakeGatewayOrigin}/v1`;
const onePixelPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
}

function safePostDataJson(request) {
  try {
    return request.postDataJSON();
  } catch {
    return null;
  }
}

function assetNames(items) {
  return items
    .map((item) => String(item || '').match(/studio-assets\/[^?#]+/)?.[0] || '')
    .filter(Boolean);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const requests = {
  generations: [],
  edits: [],
  responses: [],
  chat: [],
  jobs: [],
  models: [],
  usage: []
};
let mockedJob = null;

await page.route('**/*', async (route) => {
  const request = route.request();
  const url = request.url();

  if (url.includes('/studio-api/generation-jobs')) {
    const body = request.method() === 'POST' ? safePostDataJson(request) : null;
    requests.jobs.push({ method: request.method(), url, body });
    if (request.method() === 'POST') {
      const jobRequest = body?.request || {};
      mockedJob = {
        id: jobRequest.id || 'public-route-smoke-job',
        clientRequestId: jobRequest.clientRequestId || 'public-route-smoke-client',
        sessionId: jobRequest.sessionId || '',
        parentCanvasNodeId: jobRequest.parentCanvasNodeId || '',
        status: 'queued',
        stage: 'queued',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        mode: jobRequest.mode || 'image',
        route: jobRequest.route || 'generations',
        endpoint: jobRequest.route === 'edits' ? '/v1/images/edits' : '/v1/images/generations',
        providerId: jobRequest.providerId || '',
        providerFamily: jobRequest.providerFamily || '',
        apiKeySource: jobRequest.apiKeySource || '',
        providerLabel: jobRequest.providerLabel || '',
        model: jobRequest.model || 'gpt-image-2',
        prompt: jobRequest.prompt || '',
        generationPrompt: jobRequest.generationPrompt || jobRequest.prompt || '',
        size: jobRequest.size || '1024x1024',
        quality: jobRequest.quality || 'medium',
        outputFormat: jobRequest.outputFormat || 'png',
        moderation: jobRequest.moderation || 'auto',
        count: Number(jobRequest.count || jobRequest.n || 1),
        completed: 0,
        total: Number(jobRequest.count || jobRequest.n || 1),
        resultUrls: [],
        requestIds: [],
        timing: {
          queuedAt: Date.now(),
          startedAt: Date.now(),
          gatewayAt: Date.now(),
          responseAt: Date.now(),
          savingAt: Date.now(),
          savedAt: Date.now(),
          completedAt: null,
          totalMs: null
        }
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, job: mockedJob })
      });
    }
    if (/\/studio-api\/generation-jobs\/[^/?#]+/.test(url)) {
      const completedAt = Date.now();
      const job = {
        ...(mockedJob || {}),
        status: 'succeeded',
        stage: 'succeeded',
        completed: mockedJob?.total || 1,
        total: mockedJob?.total || 1,
        completedAt: new Date(completedAt).toISOString(),
        resultUrls: [`data:image/png;base64,${onePixelPng}`],
        requestIds: ['public-route-smoke-request'],
        timing: {
          ...(mockedJob?.timing || {}),
          completedAt,
          totalMs: 60
        }
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, job })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, jobs: [] })
    });
  }

  if (url.startsWith(`${fakeGatewayBaseUrl}/models`)) {
    requests.models.push({ method: request.method(), url });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ id: 'gpt-image-2' }, { id: 'gpt-5.5' }] })
    });
  }

  if (url.startsWith(`${fakeGatewayBaseUrl}/usage`)) {
    requests.usage.push({ method: request.method(), url });
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'usage not available in smoke' } })
    });
  }

  if (url.includes('/v1/images/generations')) {
    requests.generations.push({ method: request.method(), url, body: safePostDataJson(request) });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        created: Math.floor(Date.now() / 1000),
        data: [{ b64_json: onePixelPng }]
      })
    });
  }

  if (url.includes('/v1/images/edits')) {
    requests.edits.push({ method: request.method(), url });
    return route.abort();
  }

  if (url.includes('/v1/responses')) {
    requests.responses.push({ method: request.method(), url, body: safePostDataJson(request) });
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'responses route intercepted by public route smoke' } })
    });
  }

  if (url.includes('/v1/chat/completions')) {
    requests.chat.push({ method: request.method(), url });
    return route.abort();
  }

  return route.continue();
});

await page.addInitScript(({ providerSettingsKey, manualSecretKey, fakeSecret, fakeGatewayBaseUrl }) => {
  localStorage.setItem('image-sub2api-studio-language', 'en');
  localStorage.setItem(providerSettingsKey, JSON.stringify({
    providerId: 'openai-compatible',
    apiKeySource: 'manual',
    manualGatewayBaseUrl: fakeGatewayBaseUrl,
    route: 'auto',
    responsesModel: 'gpt-5.5',
    partialImages: 2
  }));
  sessionStorage.setItem(manualSecretKey, fakeSecret);
}, { providerSettingsKey, manualSecretKey, fakeSecret, fakeGatewayBaseUrl });

try {
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForSelector('.creationDesk.composerOpen', { timeout: 20_000 });
  await fillGenerationPrompt(page, 'A tiny public route smoke test image, simple icon on white background.');
  await clickGenerate(page);
  await page.locator('.generationConfirmPrimary').click();
  await page.waitForTimeout(6_000);

  const result = await page.evaluate(() => ({
    body: document.body.innerText.slice(0, 2400),
    scriptSrc: [...document.scripts].map((script) => script.src).filter(Boolean),
    cssHref: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.href),
    resultImages: document.querySelectorAll('.resultGrid img, .canvasNode img').length
  }));
  const jsAssets = assetNames(result.scriptSrc);
  const cssAssets = assetNames(result.cssHref);
  const createdJobRequest = requests.jobs.find((item) => item.method === 'POST');

  if (expectedJs) assert(jsAssets.some((item) => item.endsWith(expectedJs)), 'Public page is not loading the expected JS asset.', { expectedJs, jsAssets, result });
  if (expectedCss) assert(cssAssets.some((item) => item.endsWith(expectedCss)), 'Public page is not loading the expected CSS asset.', { expectedCss, cssAssets, result });
  assert(createdJobRequest, 'Public page did not try the restorable service generation queue.', { requests, result });
  assert(createdJobRequest.body?.request?.route === 'generations', 'Public page did not submit a generations service job.', { requests, result });
  assert(requests.generations.length === 0, 'Public production page should use the service queue instead of browser-direct /v1/images/generations when the queue succeeds.', { requests, result });
  assert(requests.responses.length === 0, 'Public page generation attempted /v1/responses.', { requests, result });
  assert(requests.edits.length === 0, 'Text-to-image without references attempted /v1/images/edits.', { requests, result });
  assert(requests.chat.length === 0, 'Generate action attempted the prompt assistant route.', { requests, result });
  assert(result.resultImages >= 1, 'Public page did not render the mocked generated image.', { requests, result });

  console.log(JSON.stringify({
    ok: true,
    pageUrl,
    jsAssets,
    cssAssets,
    requests,
    resultImages: result.resultImages
  }, null, 2));
} finally {
  await browser.close();
}

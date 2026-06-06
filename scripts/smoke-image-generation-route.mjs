import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotDir = 'D:/wiki/image-sub2api-studio/output/playwright';
const screenshotPath = `${screenshotDir}/image-generation-route.png`;
const providerSettingsKey = 'image-sub2api-studio:provider-settings:v1';
const manualSecretKey = 'image-sub2api-studio:manual-provider-secret:v1';
const fakeSecret = 'test-key-image-route-smoke-session-only';

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
}

function sanitizedJobBody(route) {
  if (route.request().method() !== 'POST') return null;
  const body = route.request().postDataJSON();
  return {
    ...body,
    apiKey: body?.apiKey ? '[session-secret]' : body?.apiKey
  };
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
  await server.listen();
  const baseUrl = server.resolvedUrls?.local?.[0];
  assert(baseUrl, 'Vite smoke server did not expose a local URL.');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });

  const requests = {
    generations: [],
    edits: [],
    responses: [],
    chat: [],
    jobs: []
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
  await page.route('**/studio-api/generation-jobs**', (route) => {
    requests.jobs.push({
      method: route.request().method(),
      url: route.request().url(),
      body: sanitizedJobBody(route)
    });
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'QUEUE_DISABLED_FOR_ROUTE_SMOKE' })
    });
  });
  await page.route('https://manual-route-smoke.example/v1/images/generations', (route) => {
    requests.generations.push({
      method: route.request().method(),
      url: route.request().url(),
      body: route.request().postDataJSON()
    });
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        created: Math.floor(Date.now() / 1000),
        data: [{
          b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
          revised_prompt: 'route smoke image'
        }]
      })
    });
  });
  await page.route('https://manual-route-smoke.example/v1/images/edits', (route) => {
    requests.edits.push({
      method: route.request().method(),
      url: route.request().url()
    });
    return route.abort();
  });
  await page.route('https://manual-route-smoke.example/v1/responses', (route) => {
    requests.responses.push({
      method: route.request().method(),
      url: route.request().url()
    });
    return route.abort();
  });
  await page.route('https://manual-route-smoke.example/v1/chat/completions', (route) => {
    requests.chat.push({
      method: route.request().method(),
      url: route.request().url()
    });
    return route.abort();
  });

  await page.addInitScript(({ providerSettingsKey, manualSecretKey, fakeSecret }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('image-sub2api-studio-language', 'en');
    localStorage.setItem(providerSettingsKey, JSON.stringify({
      providerId: 'openai-compatible',
      apiKeySource: 'manual',
      manualGatewayBaseUrl: 'https://manual-route-smoke.example/v1',
      route: 'auto',
      responsesModel: 'gpt-5.5',
      partialImages: 2
    }));
    localStorage.setItem('image-sub2api-studio:draft:v1', JSON.stringify({
      count: 10
    }));
    sessionStorage.setItem(manualSecretKey, fakeSecret);
  }, { providerSettingsKey, manualSecretKey, fakeSecret });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.creationDesk.composerOpen', { timeout: 12000 });
  await page.locator('.bottomComposerInput textarea').fill('A tiny route smoke test image, simple product icon on clean background.');
  await page.locator('.composerGenerateAction').click();
  await page.waitForFunction(() => document.querySelectorAll('.canvasNode img').length >= 1, null, { timeout: 12000 });
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result = await page.evaluate(({ providerSettingsKey, manualSecretKey, fakeSecret }) => ({
    body: document.body.innerText.slice(0, 1800),
    persistedSettings: localStorage.getItem(providerSettingsKey) || '',
    sessionSecret: sessionStorage.getItem(manualSecretKey) || '',
    hasSecretInDom: document.body.innerText.includes(fakeSecret),
    canvasNodes: document.querySelectorAll('.canvasNode').length,
    resultImages: document.querySelectorAll('.resultGrid img, .canvasNode img').length,
    composerHasResultStrip: Boolean(document.querySelector('.bottomComposerBar .composerResultStrip')),
    composerHasThread: document.querySelector('.bottomComposerBar')?.classList.contains('hasThread') || false
  }), { providerSettingsKey, manualSecretKey, fakeSecret });

  assert(requests.jobs.length >= 1, 'The page did not try the restorable generation queue before fallback.', { requests, result });
  const createdJobRequest = requests.jobs.find((request) => request.method === 'POST');
  assert(createdJobRequest?.body?.request?.size === '1024x1024', 'Server generation job did not receive the provider-normalized size.', { requests, result });
  assert(createdJobRequest?.body?.request?.quality === 'medium', 'Server generation job did not receive the provider-normalized quality.', { requests, result });
  assert(createdJobRequest?.body?.request?.resolutionTier === '1k', 'Server generation job did not receive the provider-normalized resolution tier.', { requests, result });
  assert(createdJobRequest?.body?.request?.count === 4, 'Server generation job count was not clamped to the provider countRange.', { requests, result });
  assert(requests.generations.length === 4, 'Text-to-image count must be clamped to the provider countRange before dispatch.', { requests, result });
  assert(requests.generations[0].body?.model === 'gpt-image-2', 'Text-to-image did not use the image model in the generations payload.', { requests, result });
  assert(requests.generations.every((request) => request.body?.n === 1), 'Legacy images generation should dispatch one image per upstream request.', { requests, result });
  assert(requests.generations[0].body?.prompt?.includes('Resolution target: 1K'), 'English image requests should append an English resolution hint.', { requests, result });
  assert(!/[\u4e00-\u9fff]/.test(requests.generations[0].body?.prompt || ''), 'English image requests must not append Chinese prompt hints.', { requests, result });
  assert(requests.responses.length === 0, 'Default text-to-image must not call /v1/responses.', { requests, result });
  assert(requests.edits.length === 0, 'Text-to-image without references must not call /v1/images/edits.', { requests, result });
  assert(requests.chat.length === 0, 'Generate action must not call the prompt assistant chat endpoint.', { requests, result });
  assert(!result.persistedSettings.includes(fakeSecret), 'Manual API key leaked into localStorage during generation.', result);
  assert(!JSON.stringify(requests).includes(fakeSecret), 'Manual API key leaked into smoke request evidence.', { requests, result });
  assert(result.sessionSecret === fakeSecret, 'Manual API key was not retained in sessionStorage for the current session.', result);
  assert(!result.hasSecretInDom, 'Manual API key leaked into visible page text.', result);
  assert(result.canvasNodes >= 1, 'Successful generation did not add a canvas node.', result);
  assert(!result.composerHasResultStrip, 'Generation results should stay on canvas/history, not inside the bottom chat composer.', result);
  assert(!result.composerHasThread, 'A successful result alone should not expand the bottom composer thread.', result);

  console.log(JSON.stringify({
    ok: true,
    screenshotPath,
    requests,
    result
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}

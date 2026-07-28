import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

process.env.VITE_STUDIO_STANDALONE = 'true';

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
  assert.ok(baseUrl, 'Vite did not expose a local URL.');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const requests = [];

  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'legacy-sub2-token-must-not-be-used');
    localStorage.setItem('image-sub2api-studio:provider-settings:v1', JSON.stringify({
      providerId: 'openai-compatible',
      apiKeySource: 'manual',
      manualApiKey: 'legacy-provider-secret-must-not-be-used',
      manualGatewayBaseUrl: 'https://untrusted.example/v1'
    }));
  });

  await page.route('**/studio-api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const postData = request.postData() || '';
    requests.push({ path, method: request.method(), authorization: request.headers().authorization || '', postData });

    let body = { ok: true };
    let status = 200;
    if (path.endsWith('/auth/login')) {
      body = {
        ok: true,
        token: 'standalone-session-token',
        expiresAt: '2030-01-01T00:00:00.000Z',
        user: { id: 'studio-user-1', username: 'studio-admin', email: 'admin@example.test', role: 'admin' }
      };
    } else if (path.endsWith('/auth/register')) {
      body = {
        ok: true,
        token: 'standalone-register-token',
        expiresAt: '2030-01-01T00:00:00.000Z',
        user: { id: 'studio-user-2', username: 'studio-creator', email: 'creator@example.test', role: 'user' }
      };
    } else if (path.endsWith('/auth/me')) {
      body = { ok: true, user: { id: 'studio-user-1', username: 'studio-admin', email: 'admin@example.test', role: 'admin' } };
    } else if (path.endsWith('/model-sync')) {
      body = { ok: true, models: [{ id: 'gpt-image-2', label: 'Image' }, { id: 'gpt-5.5', label: 'Assistant' }] };
    } else if (path.endsWith('/library')) {
      body = { ok: true, categories: [], styles: [], scenes: [], cases: [] };
    } else if (path.endsWith('/history')) {
      body = { ok: true, records: [], total: 0, nextOffset: null };
    } else if (path.endsWith('/session')) {
      body = { ok: true, session: null };
    } else if (path.endsWith('/generation-jobs')) {
      body = { ok: true, jobs: [] };
    }

    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });

  const loginUrl = new URL('login.html?redirect=https%3A%2F%2Fevil.example%2Fsteal', baseUrl).toString();
  await page.goto(loginUrl, { waitUntil: 'networkidle' });
  await page.locator('#studio-login-mode-register').click();
  await page.locator('#studio-login-email').fill('creator@example.test');
  await page.locator('#studio-login-username').fill('studio-creator');
  await page.locator('#studio-login-password').fill('register-password');
  await page.locator('#studio-login-submit').click();
  await page.waitForURL('**/studio.html', { timeout: 10000 });
  await page.waitForSelector('.creationDesk', { timeout: 10000 });
  const registerState = await page.evaluate(() => ({
    standaloneSession: localStorage.getItem('image-agent-studio:session:v1') || ''
  }));
  assert.match(registerState.standaloneSession, /standalone-register-token/, 'Standalone registration session was not stored.');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  await page.goto(loginUrl, { waitUntil: 'networkidle' });
  await page.locator('#studio-login-identifier').fill('studio-admin');
  await page.locator('#studio-login-password').fill('correct-password');
  await page.locator('#studio-login-submit').click();
  await page.waitForURL('**/studio.html', { timeout: 10000 });
  await page.waitForSelector('.creationDesk', { timeout: 10000 });

  const settingsTrigger = page.locator('[data-action="open-settings"]:visible').first();
  if (await settingsTrigger.count()) {
    await settingsTrigger.click();
  } else {
    await page.locator('.connectionPill').click({ force: true });
  }
  await page.waitForSelector('.settingsDialog');

  const state = await page.evaluate(() => ({
    currentPath: window.location.pathname,
    standaloneSession: localStorage.getItem('image-agent-studio:session:v1') || '',
    providerSettings: localStorage.getItem('image-sub2api-studio:provider-settings:v1') || '',
    manualSecret: sessionStorage.getItem('image-sub2api-studio:manual-provider-secret:v1') || '',
    passwordFieldCount: document.querySelectorAll('.settingsDialog input[type="password"]').length,
    providerOptions: [...document.querySelectorAll('.settingsDialog select option')].map((item) => item.textContent.trim()),
    providerSelectDisabled: Boolean(document.querySelector('.settingsDialog select')?.disabled),
    settingsText: document.querySelector('.settingsDialog')?.textContent || '',
    workspaceText: document.querySelector('.singleGenerationWorkspace')?.textContent || ''
  }));

  assert.equal(state.currentPath.endsWith('/studio.html'), true, 'External login redirect was not rejected.');
  assert.match(state.standaloneSession, /standalone-session-token/, 'Standalone session was not stored.');
  assert.doesNotMatch(state.providerSettings, /legacy-provider-secret|untrusted\.example|gatewayBaseUrl|manualApiKey/, 'Provider secret or URL survived standalone sanitization.');
  assert.equal(state.manualSecret, '', 'Manual provider secret remained in session storage.');
  assert.equal(state.passwordFieldCount, 0, 'Standalone settings exposed a provider secret field.');
  assert.equal(state.providerOptions.length, 1, 'Standalone settings exposed more than one provider.');
  assert.match(state.providerOptions[0], /服务端托管|Service-managed/i, 'Standalone service ownership label is missing.');
  assert.equal(state.providerSelectDisabled, true, 'Standalone provider selection should be server-owned.');
  assert.match(state.settingsText, /服务端|server/i, 'Standalone settings did not explain server ownership.');
  assert.doesNotMatch(state.settingsText, /API Key|Gateway URL|网关地址|助手模型|预览帧|\/v1\//i, 'Standalone settings exposed provider implementation details.');
  assert.doesNotMatch(state.workspaceText, /API Key|Studio Managed Provider|Server managed|\/v1\//i, 'Standalone workspace exposed provider implementation details.');

  const modelSync = requests.find((item) => item.path.endsWith('/model-sync') && item.authorization === 'Bearer standalone-session-token');
  assert.ok(modelSync, 'Standalone model sync was not requested.');
  assert.deepEqual(JSON.parse(modelSync.postData), {}, 'Standalone model sync sent client provider configuration.');
  assert.equal(modelSync.authorization, 'Bearer standalone-session-token', 'Standalone model sync did not use the Studio session.');
  assert.ok(requests.some((item) => item.path.endsWith('/auth/register')), 'Standalone registration was not requested.');
  assert.equal(requests.some((item) => item.path.includes('/api/v1/keys') || item.path.endsWith('/keys')), false, 'Standalone mode requested gateway account keys.');
  assert.equal(requests.some((item) => item.authorization.includes('legacy-sub2-token')), false, 'Standalone mode imported the legacy Sub2API token.');
  assert.equal(requests.some((item) => item.postData.includes('legacy-provider-secret') || item.postData.includes('untrusted.example')), false, 'Standalone mode sent legacy provider configuration.');

  console.log('Standalone frontend smoke passed.');
} finally {
  if (browser) await browser.close();
  await server.close();
  delete process.env.VITE_STUDIO_STANDALONE;
}

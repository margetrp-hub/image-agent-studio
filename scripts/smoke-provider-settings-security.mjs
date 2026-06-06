import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotDir = 'D:/wiki/image-sub2api-studio/output/playwright';
const screenshotPath = `${screenshotDir}/provider-settings-security.png`;
const storageKey = 'image-sub2api-studio:provider-settings:v1';
const legacyStorageKey = 'ohlaoo-studio:provider-settings:v1';
const sessionSecretKey = 'image-sub2api-studio:manual-provider-secret:v1';
const fakeSecret = 'test-key-provider-security-smoke-should-not-persist';

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
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

  await page.addInitScript(({ fakeSecret, storageKey, sessionSecretKey }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(storageKey, JSON.stringify({
      providerId: 'openai-compatible',
      apiKeySource: 'manual',
      manualGatewayBaseUrl: 'https://legacy.example/v1',
      manualApiKey: fakeSecret,
      route: 'auto',
      responsesModel: 'gpt-5.5',
      partialImages: 2
    }));
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    sessionStorage.removeItem(sessionSecretKey);
  }, { fakeSecret, storageKey, sessionSecretKey });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.creationDesk', { timeout: 8000 });

  const migrated = await page.evaluate(({ storageKey, sessionSecretKey, fakeSecret }) => ({
    persisted: localStorage.getItem(storageKey) || '',
    sessionSecret: sessionStorage.getItem(sessionSecretKey) || '',
    body: document.body.innerText.slice(0, 1800),
    hasSecretInDom: document.body.innerText.includes(fakeSecret)
  }), { storageKey, sessionSecretKey, fakeSecret });
  assert(!migrated.persisted.includes(fakeSecret), 'Legacy manual API key was not removed from localStorage after load.', migrated);
  assert(migrated.sessionSecret === fakeSecret, 'Legacy manual API key was not migrated into sessionStorage.', migrated);
  assert(!migrated.hasSecretInDom, 'Manual API key leaked into visible page text.', migrated);

  const clickedSettings = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.connectionPill, .railAvatarButton, .railAccountCard')];
    const target = buttons.find((button) => {
      const style = getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    });
    target?.click();
    return Boolean(target);
  });
  assert(clickedSettings, 'No visible provider settings button was available.');
  await page.waitForSelector('.settingsDialog', { timeout: 8000 });
  const inputsBefore = await page.evaluate(() => [...document.querySelectorAll('.settingsDialog input')].map((input) => ({
    type: input.type,
    value: input.value,
    placeholder: input.placeholder
  })));
  assert(inputsBefore.some((item) => item.type === 'password'), 'Manual API key field should be a password input.', inputsBefore);

  const gatewayInput = page.locator('.settingsDialog input:not([type="password"])').first();
  await gatewayInput.fill('https://manual.example/v1');
  await page.locator('.settingsDialog input[type="password"]').first().fill('test-key-provider-security-smoke-updated');
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const updated = await page.evaluate(({ storageKey, legacyStorageKey, sessionSecretKey }) => ({
    persisted: localStorage.getItem(storageKey) || '',
    legacyPersisted: localStorage.getItem(legacyStorageKey) || '',
    sessionSecret: sessionStorage.getItem(sessionSecretKey) || '',
    inputTypes: [...document.querySelectorAll('.settingsDialog input')].map((input) => input.type)
  }), { storageKey, legacyStorageKey, sessionSecretKey });
  assert(!updated.persisted.includes('test-key-provider-security-smoke'), 'Updated manual API key was persisted in localStorage.', updated);
  assert(!updated.legacyPersisted.includes('test-key-provider-security-smoke'), 'Updated manual API key was persisted in legacy localStorage.', updated);
  assert(updated.sessionSecret === 'test-key-provider-security-smoke-updated', 'Updated manual API key was not retained for the current browser session.', updated);
  assert(updated.persisted.includes('https://manual.example/v1'), 'Manual gateway URL should remain persistent configuration.', updated);

  console.log(JSON.stringify({
    ok: true,
    screenshotPath,
    migrated,
    updated
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}

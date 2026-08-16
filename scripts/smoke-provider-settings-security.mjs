import { chromium } from 'playwright';
import { createServer } from 'vite';

const screenshotDir = 'D:/wiki/image-sub2api-studio/output/playwright';
const screenshotPath = `${screenshotDir}/provider-settings-security.png`;
const storageKey = 'image-sub2api-studio:provider-settings:v1';
const libraryStorageKey = 'image-sub2api-studio:provider-library:v1';
const legacyStorageKey = 'ohlaoo-studio:provider-settings:v1';
const sessionSecretKey = 'image-sub2api-studio:manual-provider-secret:v1';
const themeKey = 'image-sub2api-studio:theme:v1';
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

  await page.addInitScript(({ fakeSecret, storageKey, sessionSecretKey, themeKey }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(themeKey, 'dark');
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
  }, { fakeSecret, storageKey, sessionSecretKey, themeKey });

  await page.goto(new URL('studio.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.creationDesk', { timeout: 8000 });

  const migrated = await page.evaluate(({ storageKey, sessionSecretKey, fakeSecret }) => ({
    persisted: localStorage.getItem(storageKey) || '',
    sessionSecret: sessionStorage.getItem(sessionSecretKey) || '',
    body: document.body.innerText.slice(0, 1800),
    hasSecretInDom: document.body.innerText.includes(fakeSecret),
    generationProviderValue: document.querySelector('.singleField select')?.value || ''
  }), { storageKey, sessionSecretKey, fakeSecret });
  assert(!migrated.persisted.includes(fakeSecret), 'Legacy manual API key was not removed from localStorage after load.', migrated);
  assert(migrated.sessionSecret === fakeSecret, 'Legacy manual API key was not migrated into sessionStorage.', migrated);
  assert(!migrated.hasSecretInDom, 'Manual API key leaked into visible page text.', migrated);
  assert(migrated.generationProviderValue, 'The generation surface should expose the saved provider selector.', migrated);

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
  assert(await page.locator('.providerEditorHead').count() === 0, 'Opening provider settings should show the saved provider library before an editor.', {
    editorVisible: await page.locator('.providerEditorHead').count()
  });
  await page.locator('.providerLibraryItemMain').first().click();
  await page.waitForSelector('.providerEditorHead');
  const inputsBefore = await page.evaluate(() => [...document.querySelectorAll('.settingsDialog input')].map((input) => ({
    type: input.type,
    value: input.value,
    placeholder: input.placeholder
  })));
  assert(inputsBefore.some((item) => item.type === 'password'), 'Manual API key field should be a password input.', inputsBefore);

  const gatewayInput = page.locator('.settingsDialog .providerGatewayInput');
  await gatewayInput.fill('https://manual.example/v1');
  await page.locator('.settingsDialog input[type="password"]').first().fill('test-key-provider-security-smoke-updated');
  await page.locator('.settingsActions .primaryAction').click();
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const updated = await page.evaluate(({ storageKey, libraryStorageKey, legacyStorageKey, sessionSecretKey }) => ({
    persisted: localStorage.getItem(storageKey) || '',
    libraryPersisted: localStorage.getItem(libraryStorageKey) || '',
    legacyPersisted: localStorage.getItem(legacyStorageKey) || '',
    sessionSecret: sessionStorage.getItem(sessionSecretKey) || '',
    inputTypes: [...document.querySelectorAll('.settingsDialog input')].map((input) => input.type)
  }), { storageKey, libraryStorageKey, legacyStorageKey, sessionSecretKey });
  assert(!updated.persisted.includes('test-key-provider-security-smoke'), 'Updated manual API key was persisted in localStorage.', updated);
  assert(!updated.libraryPersisted.includes('test-key-provider-security-smoke'), 'Updated manual API key was persisted in the provider library.', updated);
  assert(!updated.legacyPersisted.includes('test-key-provider-security-smoke'), 'Updated manual API key was persisted in legacy localStorage.', updated);
  assert(updated.sessionSecret === 'test-key-provider-security-smoke-updated', 'Updated manual API key was not retained for the current browser session.', updated);
  assert(updated.persisted.includes('https://manual.example/v1'), 'Manual gateway URL should remain persistent configuration.', updated);

  await page.locator('.providerLibraryNewButton').click();
  const blankNewProvider = await page.evaluate(() => ({
    name: document.querySelector('.providerNameField input')?.value || '',
    gateway: document.querySelector('.providerGatewayInput')?.value || '',
    secret: document.querySelector('.settingsDialog input[type="password"]')?.value || ''
  }));
  assert(blankNewProvider.name === '' && blankNewProvider.gateway === '' && blankNewProvider.secret === '', 'New provider should open as a blank draft instead of copying the active provider.', blankNewProvider);
  await page.locator('.providerNameField input').fill('Second provider');
  await page.locator('.providerGatewayInput').fill('https://second.example/v1');
  await page.locator('.settingsDialog input[type="password"]').first().fill('second-provider-secret');
  await page.locator('.settingsActions .primaryAction').click();
  await page.waitForFunction(() => document.querySelectorAll('.providerLibraryItem').length === 2);
  const created = await page.evaluate(({ libraryStorageKey }) => JSON.parse(localStorage.getItem(libraryStorageKey) || '{}'), { libraryStorageKey });
  assert(created.profiles?.length === 2, 'Saving a new provider should add it to the provider library.', created);
  assert(!JSON.stringify(created).includes('second-provider-secret'), 'New provider secret was persisted in the provider library.', created);

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.providerLibraryItem').filter({ hasText: 'Second provider' }).locator('button.danger').click();
  await page.waitForFunction(() => document.querySelectorAll('.providerLibraryItem').length === 1);
  const deleted = await page.evaluate(({ libraryStorageKey }) => JSON.parse(localStorage.getItem(libraryStorageKey) || '{}'), { libraryStorageKey });
  assert(deleted.profiles?.length === 1, 'Deleting a provider should remove it from the provider library.', deleted);

  console.log(JSON.stringify({
    ok: true,
    screenshotPath,
    migrated,
    updated,
    created: { profileCount: created.profiles?.length || 0 },
    deleted: { profileCount: deleted.profiles?.length || 0 }
  }, null, 2));
} finally {
  if (browser) await browser.close();
  await server.close();
}

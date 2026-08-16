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

const adminUser = {
  id: 'studio-user-1',
  username: 'studio-admin',
  email: 'admin@example.test',
  role: 'admin',
  active: true,
  createdAt: '2026-08-01T00:00:00.000Z',
  credits: { balance: 640, lifetimeEarned: 800, lifetimeSpent: 160 }
};
const creatorUser = {
  id: 'studio-user-2',
  username: 'studio-creator',
  email: 'creator@example.test',
  role: 'user',
  active: true,
  createdAt: '2026-08-02T00:00:00.000Z',
  credits: { balance: 200, lifetimeEarned: 200, lifetimeSpent: 0 }
};
let creatorBalance = creatorUser.credits.balance;
let billingSettings = {
  creditsEnabled: true,
  registrationEnabled: true,
  registrationBonusCredits: 200,
  imageGenerationCost: 10,
  imageEditCost: 15,
  videoGenerationCost: 50
};

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
      manualGatewayBaseUrl: 'https://provider.example/v1'
    }));
    sessionStorage.setItem('image-sub2api-studio:manual-provider-secret:v1', 'client-provider-secret');
  });

  await page.route('**/studio-api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const postData = request.postData() || '';
    requests.push({ path, method: request.method(), authorization: request.headers().authorization || '', postData });

    const authorization = request.headers().authorization || '';
    const currentUser = authorization.includes('standalone-register-token') ? creatorUser : adminUser;
    let body = { ok: true };
    const status = 200;
    if (path.endsWith('/auth/config')) {
      body = {
        ok: true,
        registration: { enabled: true, bonusCredits: 200, passwordMinLength: 8 },
        credits: { enabled: true },
        providerConnections: { enabled: true }
      };
    } else if (path.endsWith('/auth/login')) {
      body = {
        ok: true,
        token: 'standalone-session-token',
        expiresAt: '2030-01-01T00:00:00.000Z',
        user: adminUser
      };
    } else if (path.endsWith('/auth/register')) {
      body = {
        ok: true,
        token: 'standalone-register-token',
        expiresAt: '2030-01-01T00:00:00.000Z',
        user: creatorUser
      };
    } else if (path.endsWith('/auth/password/reset')) {
      body = { ok: true, user: adminUser };
    } else if (path.endsWith('/auth/me')) {
      body = {
        ok: true,
        user: currentUser.id === creatorUser.id
          ? { ...creatorUser, credits: { ...creatorUser.credits, balance: creatorBalance } }
          : adminUser
      };
    } else if (path.endsWith('/auth/credits/transactions')) {
      body = {
        ok: true,
        credits: currentUser.credits,
        transactions: [{
          id: 'credit-transaction-1',
          delta: 200,
          balanceAfter: 640,
          kind: 'admin_adjustment',
          createdAt: '2026-08-03T00:00:00.000Z'
        }]
      };
    } else if (path.endsWith('/auth/admin/billing/settings')) {
      if (request.method() === 'POST') billingSettings = { ...billingSettings, ...JSON.parse(postData) };
      body = { ok: true, settings: billingSettings };
    } else if (path.endsWith('/auth/admin/billing/stats')) {
      body = {
        ok: true,
        stats: { users: 2, activeUsers: 2, balance: 640 + creatorBalance, spent: 160, transactions: 3 }
      };
    } else if (path.endsWith('/auth/admin/users')) {
      body = {
        ok: true,
        users: [adminUser, { ...creatorUser, credits: { ...creatorUser.credits, balance: creatorBalance } }]
      };
    } else if (path.endsWith(`/auth/admin/users/${creatorUser.id}/credits`)) {
      const input = JSON.parse(postData);
      creatorBalance += Number(input.amount || 0);
      body = {
        ok: true,
        user: creatorUser,
        credits: { ...creatorUser.credits, balance: creatorBalance }
      };
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
  assert.equal(await page.locator('#studio-login-reward').isVisible(), true, 'Registration reward should be visible when registration is enabled.');
  assert.match(await page.locator('#studio-login-reward').innerText(), /200/, 'Registration reward amount was not rendered.');
  assert.equal(await page.locator('#studio-login-identifier-field').isVisible(), true, 'Login mode should show the account field.');
  assert.equal(await page.locator('#studio-login-email-field').isVisible(), false, 'Login mode should hide the registration email field.');
  assert.equal(await page.locator('#studio-login-username-field').isVisible(), false, 'Login mode should hide the registration username field.');
  await page.locator('#studio-login-recovery-link').click();
  assert.equal(await page.locator('#studio-login-recovery-heading').isVisible(), true, 'Password recovery heading should be visible.');
  assert.equal(await page.locator('#studio-login-reset-token-field').isVisible(), true, 'Password recovery should show the reset token field.');
  assert.equal(await page.locator('#studio-login-password-confirm-field').isVisible(), true, 'Password recovery should show password confirmation.');
  await page.locator('#studio-login-identifier').fill('admin@example.test');
  await page.locator('#studio-login-reset-token').fill('admin-reset-token');
  await page.locator('#studio-login-password').fill('reset-password');
  await page.locator('#studio-login-password-confirm').fill('reset-password');
  await page.locator('#studio-login-submit').click();
  await page.waitForFunction(() => document.querySelector('#studio-login-status')?.textContent?.includes('密码已更新'));
  assert.equal(await page.locator('#studio-login-identifier').inputValue(), 'admin@example.test', 'Password recovery should retain the account identifier.');
  assert.ok(requests.some((item) => item.path.endsWith('/auth/password/reset') && item.method === 'POST'), 'Password recovery did not call the reset API.');
  assert.equal(await page.locator('#studio-login-recovery-heading').isVisible(), false, 'Password recovery should return to login mode after success.');
  await page.locator('#studio-login-mode-register').click();
  assert.equal(await page.locator('#studio-login-identifier-field').isVisible(), false, 'Registration mode should hide the login account field.');
  assert.equal(await page.locator('#studio-login-email-field').isVisible(), true, 'Registration mode should show the email field.');
  assert.equal(await page.locator('#studio-login-username-field').isVisible(), true, 'Registration mode should show the username field.');
  assert.equal(await page.locator('#studio-login-password').getAttribute('type'), 'password', 'Password should be hidden by default.');
  await page.locator('#studio-login-password-toggle').click();
  assert.equal(await page.locator('#studio-login-password').getAttribute('type'), 'text', 'Password visibility toggle did not reveal the password.');
  await page.locator('#studio-login-password-toggle').click();
  assert.equal(await page.locator('#studio-login-password').getAttribute('type'), 'password', 'Password visibility toggle did not restore masking.');
  await page.locator('#studio-login-email').fill('creator@example.test');
  await page.locator('#studio-login-username').fill('studio-creator');
  const registerRequestsBeforeValidation = requests.filter((item) => item.path.endsWith('/auth/register')).length;
  await page.locator('#studio-login-submit').click();
  assert.equal(await page.locator('#studio-login-status').innerText(), '请输入密码。', 'Empty registration password did not receive a specific message.');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'studio-login-password', 'Empty registration password did not receive focus.');
  assert.equal(requests.filter((item) => item.path.endsWith('/auth/register')).length, registerRequestsBeforeValidation, 'Empty registration password should not call the auth API.');
  await page.locator('#studio-login-password').fill('short');
  await page.locator('#studio-login-submit').click();
  assert.equal(await page.locator('#studio-login-status').innerText(), '密码至少需要 8 位。', 'Short registration password did not receive the minimum-length message.');
  assert.equal(requests.filter((item) => item.path.endsWith('/auth/register')).length, registerRequestsBeforeValidation, 'Short registration password should not call the auth API.');
  await page.locator('#studio-login-password').fill('register-password');
  await page.locator('#studio-login-submit').click();
  await page.waitForURL('**/studio.html', { timeout: 10000 });
  await page.waitForSelector('.creationDesk', { timeout: 10000 });
  const registerState = await page.evaluate(() => ({
    standaloneSession: localStorage.getItem('image-agent-studio:session:v1') || '',
    accountText: document.querySelector('.railAccountCard')?.textContent || '',
    adminButtonCount: document.querySelectorAll('.railAdminButton').length
  }));
  assert.match(registerState.standaloneSession, /standalone-register-token/, 'Standalone registration session was not stored.');
  assert.match(registerState.accountText, /200\s*积分/, 'Registration credits were not shown in the account rail.');
  assert.equal(registerState.adminButtonCount, 0, 'Regular users should not see the admin entry.');

  await page.goto(new URL('admin.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.iasAdminGate');
  assert.match(await page.locator('.iasAdminGate').innerText(), /没有管理员权限/, 'Regular users were not denied access to the admin page.');
  assert.equal(
    requests.some((item) => item.authorization === 'Bearer standalone-register-token' && item.path.includes('/auth/admin/')),
    false,
    'Regular-user admin page attempted privileged API calls.'
  );
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
  assert.match(await page.locator('.railAccountCard').innerText(), /640\s*积分/, 'Admin credits were not shown in the account rail.');
  assert.equal(await page.locator('.railAdminButton').count(), 1, 'Admin entry is missing from the account rail.');

  const settingsTrigger = page.locator('[data-action="open-settings"]:visible').first();
  if (await settingsTrigger.count()) {
    await settingsTrigger.click();
  } else {
    await page.locator('.connectionPill').click({ force: true });
  }
  await page.waitForSelector('.settingsDialog');
  await page.locator('.providerLibraryNewButton').click();
  await page.waitForSelector('.providerTypeSelect');
  assert.equal(await page.locator('.providerLibrary').count(), 0, 'Standalone new-provider mode should replace the provider library.');
  assert.equal(await page.locator('.providerAuthMode').count(), 1, 'Standalone compatible providers should expose an authentication choice.');
  assert.equal(await page.locator('.providerConnectionBox').count(), 0, 'Manual provider setup should not stack account-binding fields.');
  await page.locator('.providerAuthMode button').nth(1).click();
  assert.equal(await page.locator('.providerConnectionBox').count(), 1, 'Account-binding mode should show its own provider form.');
  assert.equal(await page.locator('.providerGatewayInput').count(), 0, 'Account-binding mode should hide manual provider credentials.');
  await page.locator('.providerAuthMode button').first().click();
  assert.equal(await page.locator('.providerConnectionBox').count(), 0, 'Manual-key mode should remove the account-binding form.');
  assert.equal(await page.locator('.providerGatewayInput').count(), 1, 'Manual-key mode should restore provider credentials.');
  await page.screenshot({ path: 'output/playwright/standalone-provider-create.png' });
  await page.locator('.providerTypeSelect').selectOption('nano-banana-compatible');
  assert.equal(await page.locator('.providerVideoModelField').count(), 0, 'Image-only standalone providers should hide video fields.');
  await page.locator('.providerTypeSelect').selectOption('xai-compatible');
  assert.equal(await page.locator('.providerVideoModelField').count(), 1, 'Video-capable standalone providers should show video fields.');

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
  assert.doesNotMatch(state.providerSettings, /legacy-provider-secret|manualApiKey/, 'Provider secret survived standalone sanitization.');
  assert.equal(state.manualSecret, 'client-provider-secret', 'Standalone settings did not retain the session-only provider secret.');
  assert.ok(state.passwordFieldCount >= 1, 'Standalone settings did not expose provider credential fields.');
  assert.ok(state.providerOptions.length >= 1, 'Standalone settings did not expose a provider selector.');
  assert.ok(state.providerOptions.some((value) => /OpenAI|Grok|NewAPI|Video|Nano|API/i.test(value)), 'Standalone provider options are empty.');
  assert.equal(state.providerSelectDisabled, false, 'Standalone provider selection should remain available for custom providers.');
  assert.match(state.settingsText, /接口地址|密钥|manual|key|endpoint/i, 'Standalone settings did not expose user provider configuration.');
  assert.doesNotMatch(state.workspaceText, /API Key|Studio Managed Provider|Server managed|\/v1\//i, 'Standalone workspace exposed provider implementation details.');

  const modelSync = requests.find((item) => item.path.endsWith('/model-sync') && item.authorization === 'Bearer standalone-session-token');
  assert.ok(modelSync, 'Standalone model sync was not requested.');
  const modelSyncBody = JSON.parse(modelSync.postData);
  assert.equal(modelSyncBody.apiKey, 'client-provider-secret', 'Standalone model sync did not use the user provider key.');
  assert.equal(modelSyncBody.gatewayBaseUrl, 'https://provider.example/v1', 'Standalone model sync did not use the user provider URL.');
  assert.equal(modelSync.authorization, 'Bearer standalone-session-token', 'Standalone model sync did not use the Studio session.');
  assert.ok(requests.some((item) => item.path.endsWith('/auth/register')), 'Standalone registration was not requested.');
  assert.equal(requests.some((item) => item.path.includes('/api/v1/keys') || item.path.endsWith('/keys')), false, 'Standalone mode requested gateway account keys.');
  assert.equal(requests.some((item) => item.authorization.includes('legacy-sub2-token')), false, 'Standalone mode imported the legacy Sub2API token.');
  assert.equal(requests.some((item) => item.postData.includes('legacy-provider-secret') || item.postData.includes('untrusted.example')), false, 'Standalone mode sent legacy provider configuration.');

  await page.goto(new URL('admin.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.iasAdminApp');
  assert.match(await page.locator('.iasAdminHeading').innerText(), /运营概览/, 'Admin dashboard did not render.');
  assert.match(await page.locator('.iasStatsGrid').innerText(), /注册用户[\s\S]*2/, 'Admin stats were not rendered.');
  assert.match(await page.locator('.iasUsersSection').innerText(), /studio-creator[\s\S]*200/, 'Admin user credits were not rendered.');

  const bonusInput = page.locator('.iasCostGrid .iasField').filter({ hasText: '注册奖励' }).locator('input');
  await bonusInput.fill('250');
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.waitForFunction(() => document.querySelector('.iasAlertSuccess')?.textContent?.includes('设置已保存'));
  const settingsRequest = requests.find((item) => item.path.endsWith('/auth/admin/billing/settings') && item.method === 'POST');
  assert.ok(settingsRequest, 'Admin billing settings update was not requested.');
  assert.equal(JSON.parse(settingsRequest.postData).registrationBonusCredits, 250, 'Admin billing settings sent the wrong registration bonus.');

  const creatorRow = page.locator('.iasUserTable tbody tr').filter({ hasText: 'creator@example.test' });
  await creatorRow.getByRole('button', { name: '调账' }).click();
  await page.locator('.iasDialog input').fill('25');
  await page.locator('.iasDialog textarea').fill('Smoke test credit adjustment');
  await page.getByRole('button', { name: '确认调账' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.iasUserTable tbody tr')].some((row) => row.textContent?.includes('creator@example.test') && row.textContent?.includes('225')));
  const adjustmentRequest = requests.find((item) => item.path.endsWith(`/auth/admin/users/${creatorUser.id}/credits`));
  assert.ok(adjustmentRequest, 'Admin credit adjustment was not requested.');
  assert.deepEqual(JSON.parse(adjustmentRequest.postData), { amount: 25, reason: 'Smoke test credit adjustment' }, 'Admin credit adjustment payload is incorrect.');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(loginUrl, { waitUntil: 'networkidle' });
  const mobileLoginLayout = await page.evaluate(() => {
    const panel = document.querySelector('.studioLoginPanel')?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      panelLeft: panel?.left ?? -1,
      panelRight: panel?.right ?? window.innerWidth + 1
    };
  });
  assert.ok(mobileLoginLayout.pageWidth <= mobileLoginLayout.viewportWidth + 1, 'Mobile login page has horizontal overflow.');
  assert.ok(mobileLoginLayout.panelLeft >= 0 && mobileLoginLayout.panelRight <= mobileLoginLayout.viewportWidth, 'Mobile login panel exceeds the viewport.');

  await page.evaluate(() => {
    localStorage.setItem('image-agent-studio:session:v1', JSON.stringify({
      accessToken: 'standalone-session-token',
      expiresAt: Date.parse('2030-01-01T00:00:00.000Z'),
      user: { id: 'studio-user-1', username: 'studio-admin', email: 'admin@example.test', role: 'admin' }
    }));
  });
  await page.goto(new URL('admin.html', baseUrl).toString(), { waitUntil: 'networkidle' });
  await page.waitForSelector('.iasAdminApp');
  const mobileAdminLayout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    pageWidth: document.documentElement.scrollWidth,
    tableWrapWidth: document.querySelector('.iasTableWrap')?.getBoundingClientRect().width || 0,
    tableWidth: document.querySelector('.iasUserTable')?.getBoundingClientRect().width || 0
  }));
  assert.ok(mobileAdminLayout.pageWidth <= mobileAdminLayout.viewportWidth + 1, 'Mobile admin page has horizontal overflow.');
  assert.ok(mobileAdminLayout.tableWidth >= mobileAdminLayout.tableWrapWidth, 'Admin table should scroll inside its own container on mobile.');

  console.log('Standalone frontend smoke passed.');
} finally {
  if (browser) await browser.close();
  await server.close();
  delete process.env.VITE_STUDIO_STANDALONE;
}

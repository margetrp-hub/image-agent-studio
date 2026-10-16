import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

process.env.VITE_STUDIO_STANDALONE = 'true';
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
const output = path.resolve('output/playwright/admin-console');
const user = { id: 'admin-test', username: 'studio-admin', email: 'admin@example.test', role: 'admin', active: true };
const creator = { id: 'creator-test', username: 'creator', email: 'creator@example.test', role: 'user', active: true, credits: { balance: 200 }, createdAt: '2026-10-01T12:00:00Z' };
let settings = { creditsEnabled: false, registrationEnabled: true, registrationBonusCredits: 200, imageGenerationCost: 10, imageEditCost: 15, videoGenerationCost: 50, rechargeEnabled: true, creditCodeEnabled: true, providerBindingEnabled: true, rechargeShopUrl: 'https://example.test/shop' };
const system = { registrationMode: 'disabled', passwordMinLength: 8, sessionTtlMs: 604800000, providerSecretsConfigured: false, allowPrivateProviderUrls: false, userProviderOnly: true, jobConcurrency: 0, jobTimeoutMs: 2700000, maxImageBytes: 33554432, maxVideoBytes: 268435456, storage: 'sqlite' };
const patches = [];
let role = 'admin';
let failSave = false;
let failUpdate = false;
let privilegedCalls = 0;
let browser;
let page;
try {
  await server.listen();
  await fs.mkdir(output, { recursive: true });
  const base = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.addInitScript((account) => localStorage.setItem('image-agent-studio:session:v1', JSON.stringify({ accessToken: 'admin-test-token', expiresAt: Date.parse('2035-01-01'), user: account })), user);
  await page.route('**/studio-api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.replace('/studio-api', '');
    let result = { ok: true };
    let status = 200;
    if (endpoint.includes('/auth/admin/')) privilegedCalls += 1;
    if (endpoint === '/auth/me') result.user = { ...user, role };
    else if (endpoint === '/auth/admin/system') result.system = system;
    else if (endpoint === '/auth/admin/billing/settings') {
      if (request.method() === 'POST') {
        if (failSave) { status = 500; result = { ok: false, error: 'SAVE_FAILED' }; }
        else { const patch = request.postDataJSON(); patches.push(patch); settings = { ...settings, ...patch }; }
      }
      result.settings = settings;
    } else if (endpoint === '/auth/admin/billing/stats') result.stats = { users: 2, activeUsers: 2, balance: 400, spent: 120, transactions: 6 };
    else if (endpoint === '/auth/admin/users') result.users = [user, creator];
    else if (endpoint.endsWith('/password-reset')) result = { ok: true, token: 'test-once-only-token', expiresAt: '2035-01-01T00:00:00Z', user: creator };
    else if (endpoint === '/auth/admin/billing/codes') {
      if (request.method() === 'POST') result.code = { id: 'code-test', code: 'TESTONLYCODE123', amount: 1000 };
      else result.codes = [];
    } else if (endpoint === '/auth/admin/update/status') {
      if (failUpdate) { status = 503; result = { ok: false, error: 'UPDATE_SERVICE_UNAVAILABLE' }; }
      else result.update = { state: 'idle', currentVersion: '1.0.30' };
    } else if (endpoint === '/auth/admin/providers') result.providers = [];
    else if (endpoint === '/auth/config') result.registration = { enabled: true };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result) });
  });
  const navigate = async (label) => {
    if (await page.getByRole('button', { name: '打开管理导航' }).isVisible()) await page.getByRole('button', { name: '打开管理导航' }).click();
    await page.getByRole('navigation', { name: '管理导航' }).getByRole('link', { name: label, exact: true }).click();
    await page.waitForFunction((title) => document.querySelector('h1')?.textContent === title, label);
  };
  const noOverflow = async () => {
    const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth, main: document.querySelector('.iasAdminBody')?.getBoundingClientRect().right }));
    assert.ok(layout.scroll <= layout.width + 1 && layout.body <= layout.width + 1 && layout.main <= layout.width + 1, JSON.stringify(layout));
  };
  await page.goto(new URL('admin.html', base).toString(), { waitUntil: 'networkidle' });
  assert.equal(await page.getByRole('navigation').getByRole('link').count(), 7);
  assert.equal(await page.locator('.iasUsersSection').count(), 0, 'Overview must not contain all admin pages');
  await page.screenshot({ path: path.join(output, 'overview-desktop.png'), animations: 'disabled' });
  await navigate('积分与充值');
  await page.getByLabel('注册奖励', { exact: true }).fill('325');
  await navigate('注册与账户');
  await page.getByRole('switch', { name: '开放注册', exact: true }).click();
  assert.ok((await page.locator('.iasSettingsForm').innerText()).includes('服务器关闭了公开注册'));
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.waitForFunction(() => document.querySelector('.iasAlertSuccess')?.textContent.includes('设置已保存'));
  assert.deepEqual(patches.at(-1), { registrationEnabled: false }, 'Save must send only this page patch');
  await navigate('积分与充值');
  assert.equal(await page.getByLabel('注册奖励', { exact: true }).inputValue(), '325', 'Navigation or another section save lost draft');
  await page.getByRole('button', { name: '刷新数据' }).click();
  await page.waitForFunction(() => document.querySelector('main')?.getAttribute('aria-busy') === 'false');
  assert.equal(await page.getByLabel('注册奖励', { exact: true }).inputValue(), '325', 'Refresh lost unsaved draft');
  failSave = true;
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.locator('.iasAlertError').waitFor();
  assert.equal(await page.getByLabel('注册奖励', { exact: true }).inputValue(), '325');
  failSave = false;
  await page.getByRole('button', { name: '保存设置' }).click();
  await page.waitForFunction(() => document.querySelector('.iasAlertSuccess')?.textContent.includes('设置已保存'));
  assert.deepEqual(patches.at(-1), { registrationBonusCredits: 325 });
  await page.screenshot({ path: path.join(output, 'billing-desktop.png'), animations: 'disabled' });
  await navigate('用户账户');
  await page.getByLabel('搜索用户').fill('creator@');
  assert.equal(await page.locator('.iasUserTable tbody tr').count(), 1);
  await page.getByRole('button', { name: '生成密码重置码' }).click();
  await page.getByRole('button', { name: '生成重置码', exact: true }).click();
  await page.getByLabel('一次性重置码').waitFor();
  assert.equal(await page.getByLabel('一次性重置码').inputValue(), 'test-once-only-token');
  assert.match(await page.getByRole('dialog').innerText(), /2035/);
  await page.screenshot({ path: path.join(output, 'reset-dialog.png'), animations: 'disabled' });
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  assert.equal(await page.getByLabel('一次性重置码').count(), 0);
  await page.reload({ waitUntil: 'networkidle' });
  assert.match(await page.locator('h1').innerText(), /用户账户/);
  await noOverflow();
  await page.screenshot({ path: path.join(output, 'users-desktop.png'), animations: 'disabled' });
  await navigate('兑换码');
  await page.getByRole('button', { name: '创建兑换码', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '创建兑换码', exact: true }).click();
  await page.getByLabel('新兑换码').waitFor();
  assert.equal(await page.getByLabel('新兑换码').inputValue(), 'TESTONLYCODE123', 'Refresh must not unmount the one-time code');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await navigate('供应商与定价');
  await page.getByRole('button', { name: '新增供应商' }).waitFor();
  await page.screenshot({ path: path.join(output, 'providers-empty.png'), animations: 'disabled' });
  failUpdate = true;
  await page.reload({ waitUntil: 'networkidle' });
  assert.ok(page.url().includes('admin.html'), 'Optional endpoint failure logged administrator out');
  assert.match(await page.locator('.iasAdminBody').innerText(), /更新状态读取失败/);
  failUpdate = false;
  await navigate('系统运行');
  await page.getByRole('button', { name: '刷新数据' }).click();
  await page.waitForFunction(() => document.querySelector('main')?.getAttribute('aria-busy') === 'false');
  await navigate('系统运行');
  await page.getByRole('button', { name: '切换主题' }).click();
  await page.screenshot({ path: path.join(output, 'system-dark.png'), animations: 'disabled' });
  await noOverflow();
  await page.getByRole('button', { name: '切换主题' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const label of ['运营概览', '用户账户', '供应商与定价', '注册与账户', '积分与充值', '兑换码', '系统运行']) {
    await navigate(label); await noOverflow();
  }
  await navigate('积分与充值');
  await page.screenshot({ path: path.join(output, 'billing-mobile.png'), animations: 'disabled' });
  await page.getByRole('button', { name: '打开管理导航' }).click();
  await page.screenshot({ path: path.join(output, 'navigation-mobile.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  role = 'user'; privilegedCalls = 0;
  await page.reload({ waitUntil: 'networkidle' });
  assert.match(await page.locator('.iasAdminGate').innerText(), /没有管理员权限/);
  assert.equal(privilegedCalls, 0, 'Nonadmin must not load privileged data');
  assert.deepEqual(browserErrors, []);
  console.log(`Admin console smoke passed; screenshots: ${output}`);
} catch (error) {
  if (page) { await page.screenshot({ path: path.join(output, 'failure.png') }); console.error(await page.locator('body').innerText()); }
  throw error;
} finally {
  await browser?.close();
  await server.close();
}

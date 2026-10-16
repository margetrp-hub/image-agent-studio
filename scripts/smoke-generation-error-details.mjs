import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { createTranslator } from '../src/studio/i18n.js';

const prompt = 'Root prompt:\nA glass vase\nPrevious result prompt to inherit:\nA blue vase\nNext change request:\nAnimate it\nLineage summary:\n#1 image';
const htmlError = {
  code: 'HTTP_502',
  status: 502,
  requestId: 'req-video-502',
  message: '<!DOCTYPE html><html><head><title>ohlao.cfd | 502: Bad gateway</title></head><body><script>const timeout = 1000;</script>Bad gateway</body></html>'
};
const providerError = {
  code: 'VIDEO_PROVIDER_ERROR',
  status: 422,
  requestId: 'req-video-json',
  message: 'Video duration must be < 16 seconds; received 20.'
};
const t = createTranslator('en');
const scenarios = [
  { name: 'local-null-error', local: true, error: null, expected: t('errors.generationFailed') },
  { name: 'local-empty-error', local: true, error: {}, expected: t('errors.generationFailed') },
  { name: 'restored-html-error', error: htmlError, expected: t('errors.serviceUnavailable') },
  { name: 'polled-html-error', polling: true, error: htmlError, expected: t('errors.serviceUnavailable') },
  { name: 'provider-json-error', error: providerError, expected: providerError.message },
  { name: 'unknown-result', status: 'unknown', error: null, expected: t('jobs.unknown') }
];
const server = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
let browser;
const failures = [];

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const scenario of scenarios) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
    try {
      const sessionId = `error-${scenario.name}`;
      const job = {
        id: `job-${scenario.name}`, sessionId, mode: 'video', model: 'grok-imagine-video',
        prompt, generationPrompt: prompt, status: scenario.status || 'failed',
        stage: scenario.status || 'failed', error: scenario.error,
        requestIds: scenario.error ? [scenario.error.requestId] : [], resultUrls: [], count: 1
      };
      const initialJob = scenario.polling ? { ...job, status: 'gateway', stage: 'gateway', error: null, requestIds: [] } : job;
      const session = {
        sessionId, mode: 'video', status: 'idle', message: '', prompt,
        generationQueue: [{
          id: `task-${scenario.name}`, serverJobId: scenario.local ? '' : job.id,
          remote: !scenario.local, mode: 'video', status: scenario.polling ? 'running' : job.status,
          prompt, summary: prompt, error: scenario.local ? scenario.error : null, restorable: false
        }],
        assistantMessages: [], canvasNodes: []
      };
      await page.addInitScript(({ session }) => {
        localStorage.setItem('image-sub2api-studio-language', 'en');
        localStorage.setItem('auth_token', 'error-smoke-token');
        localStorage.setItem('auth_user', JSON.stringify({ id: 1, email: 'error-smoke@example.com' }));
        localStorage.setItem('image-sub2api-studio:current-session:v1:active', session.sessionId);
        localStorage.setItem(`image-sub2api-studio:current-session:v1:${session.sessionId}`, JSON.stringify(session));
        localStorage.setItem('image-sub2api-studio:workbench-layout:v7', JSON.stringify({ bottomComposer: true, flowMode: 'single' }));
        window.__errorCopies = [];
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => window.__errorCopies.push(value) } });
      }, { session });
      let polls = 0;
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        const path = url.pathname;
        let payload;
        if (path.endsWith('/auth/me')) payload = { id: 1, email: 'error-smoke@example.com' };
        else if (path.startsWith('/studio-api/')) {
          payload = { ok: true };
          if (path.endsWith('/session')) payload = { ok: true, session: route.request().method() === 'POST' ? route.request().postDataJSON() : session };
          else if (path.endsWith('/generation-jobs')) payload = { ok: true, jobs: scenario.local ? [] : [initialJob] };
          else if (path.endsWith(`/generation-jobs/${job.id}`)) {
            polls += 1;
            payload = { ok: true, job };
          } else if (path.endsWith('/history')) payload = { ok: true, records: [], total: 0, nextOffset: null };
          else if (path.endsWith('/library')) payload = { ok: true, categories: [], styles: [], scenes: [], cases: [] };
        } else if (path.endsWith('/v1/models')) payload = { data: [{ id: 'grok-imagine-video' }] };
        else if (path.includes('/keys') || path.includes('/api-keys')) payload = [];
        else if (path.includes('/dashboard/')) payload = {};
        if (payload) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
        if (url.origin !== new URL(server.resolvedUrls.local[0]).origin) return route.abort();
        return route.continue();
      });
      await page.goto(new URL('studio.html', server.resolvedUrls.local[0]).href, { waitUntil: 'networkidle' });
      await page.locator(`.canvasQueueItem.${job.status} .canvasQueueErrorSummary`).first().click();
      const detail = await page.locator('.studioErrorDialog pre').innerText();
      assert(!/Root prompt|Previous result prompt|Next change request|Lineage summary/.test(detail), `Prompt leaked into error detail: ${detail}`);
      assert(detail.includes(scenario.expected), `Missing failure reason: ${detail}`);
      assert(!/<!doctype|<html|<script/i.test(detail), `Raw HTML leaked into error detail: ${detail}`);
      if (scenario.local) assert.equal(detail, scenario.expected);
      if (scenario.error?.code) {
        for (const value of [scenario.error.code, `HTTP ${scenario.error.status}`, scenario.error.requestId]) {
          assert(detail.includes(value), `Missing error metadata ${value}: ${detail}`);
        }
      }
      if (scenario.name === 'restored-html-error') {
        await page.screenshot({ path: 'output/playwright/generation-error-details/http-502.png', animations: 'disabled' });
      }
      await page.locator('.studioErrorDialog .studioModalCopy').click();
      await page.waitForFunction(() => window.__errorCopies.length === 1);
      assert.equal(await page.evaluate(() => window.__errorCopies[0]), detail);
      await page.keyboard.press('Escape');
      if (scenario.error === htmlError) {
        const live = page.locator('.singleStatusLine.error');
        const liveText = await live.innerText();
        assert(liveText.includes(scenario.expected), `Live status lost upstream failure: ${liveText}`);
        assert(liveText.includes(scenario.error.requestId), `Live status lost request ID: ${liveText}`);
        assert(!/Root prompt|<!doctype|<html|<script/i.test(liveText), `Invalid live status: ${liveText}`);
      }
      if (scenario.polling) assert(polls > 0, 'The restored task was never polled.');
      console.log(`PASS ${scenario.name}`);
    } catch (error) {
      failures.push(`${scenario.name}: ${error.message}`);
      console.error(`FAIL ${scenario.name}: ${error.message}`);
    } finally {
      await page.close();
    }
  }
} finally {
  if (browser) await browser.close();
  await server.close();
}

assert.equal(failures.length, 0, failures.join('\n'));
console.log('Generation error details smoke passed.');

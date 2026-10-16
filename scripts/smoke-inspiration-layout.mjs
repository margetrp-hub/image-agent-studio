import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const baseline = process.argv.includes('--baseline');
const phase = baseline ? 'before' : 'after';
const output = 'output/playwright';
const existingPrompt = 'Keep this independent creation prompt.';
const cases = [
  ...Array.from({ length: 36 }, (_, index) => ({
    id: index + 1,
    title: `Product study ${String(index + 1).padStart(2, '0')}`,
    category: index % 2 ? 'Portraits' : 'Products',
    sourceName: index % 3 ? 'Original collection' : 'User shared',
    promptPreview: `Product composition ${index + 1} with natural light and a clean background.`,
    prompt: `Full product prompt ${index + 1} with natural light and a clean background.`,
    image: `/images/gallery-fixture-${index + 1}.png`,
    thumbnail: `/images/thumbs/gallery-fixture-${index + 1}.webp`
  })),
  ...Array.from({ length: 15 }, (_, index) => ({
    id: `prompt-${index + 1}`,
    title: `Prompt study ${String(index + 1).padStart(2, '0')}`,
    category: 'Products',
    sourceName: 'Original collection',
    promptPreview: `Prompt-only composition ${index + 1} with balanced typography and natural materials.`,
    imageUnavailable: true,
    image: `https://example.invalid/missing-${index + 1}.jpg`
  }))
];
const payload = {
  categories: ['Products', 'Portraits'], styles: [], scenes: [], cases,
  videoInspirations: Array.from({ length: 20 }, (_, index) => ({
    id: `video-${index + 1}`, kind: 'video-inspiration', title: `Video study ${index + 1}`,
    summary: 'A slow camera move around a product.', prompt: `Video prompt ${index + 1}`,
    videoAspect: '16:9', videoDuration: 5
  }))
};
const server = await createServer({
  logLevel: 'silent',
  cacheDir: 'node_modules/.vite-inspiration-layout',
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }
});
let browser;
try {
  await mkdir(output, { recursive: true });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const results = [];
  const viewports = [{ width: 1440, height: 980 }, { width: 390, height: 844 }];
  if (!baseline) viewports.push({ width: 320, height: 740 }, { width: 768, height: 1024 });
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    page.setDefaultTimeout(10000);
    const requests = [];
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (/gallery-fixture-|example.invalid/.test(request.url())) requests.push(request.url());
    });
    await page.addInitScript(({ payload, existingPrompt, language }) => {
      localStorage.setItem('image-sub2api-studio-language', language);
      localStorage.setItem('image-sub2api-studio:current-session:v1', JSON.stringify({
        sessionId: 'gallery-layout-fixture', mode: 'image', status: 'idle', prompt: existingPrompt,
        model: 'gpt-image-2', generationQueue: [], canvasNodes: []
      }));
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input?.url || '';
        if (/\/(cases|inspirations)\.json(?:\?|$)/.test(url)) {
          return new Response(JSON.stringify(url.includes('cases.json') ? payload : { cases: [], sources: [] }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return originalFetch(input, init);
      };
    }, { payload, existingPrompt, language: viewport.width === 320 ? 'en' : 'zh-CN' });
    await page.route('**/*gallery-fixture-*', async (route) => {
      // Hold responses briefly to measure the reserved thumbnail geometry.
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#dae5e1"/><rect x="250" y="90" width="140" height="300" rx="16" fill="#37766a"/><rect x="265" y="180" width="110" height="110" fill="#f5f5f2"/></svg>' });
    });
    await page.goto(new URL('studio.html', server.resolvedUrls.local[0]).href, { waitUntil: 'networkidle' });
    // The mobile shell hides its rail; enter the owned gallery through its existing handler.
    await page.locator('[data-workspace="inspiration"]').first().evaluate((button) => button.click()).catch(async (error) => {
      throw new Error(`${error.message}\n${JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(0, 800) })}`);
    });
    await page.locator('.inspirationCanvasGrid .caseTile').first().waitFor();
    const firstBox = await page.locator('.caseMedia').first().boundingBox();
    await page.waitForTimeout(700);
    const metrics = await page.evaluate(() => {
      const bounds = (selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
      };
      const zone = document.querySelector('.promptOnlyZone');
      const promptTitle = zone?.querySelector('.promptCaseMain strong')?.getBoundingClientRect();
      const promptActions = zone?.querySelector('.caseTileActions')?.getBoundingClientRect();
      return {
        viewport: innerWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        filterOverflow: [...document.querySelectorAll('.galleryWorkspaceToolbar > *')].some((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < 0 || rect.right > innerWidth;
        }),
        header: bounds('.galleryWorkspaceHead'), toolbar: bounds('.galleryWorkspaceToolbar'),
        categorySelect: bounds('.galleryCategoryFilter select'),
        firstCard: bounds('.inspirationCanvasGrid > .caseTile'), media: bounds('.caseMedia'),
        imageCards: document.querySelectorAll('.inspirationCanvasGrid > .caseTile').length,
        promptCards: document.querySelectorAll('.promptOnlyZone .caseTile').length,
        promptTitleOverlapsActions: Boolean(promptTitle && promptActions && promptTitle.left < promptActions.right
          && promptTitle.right > promptActions.left && promptTitle.top < promptActions.bottom && promptTitle.bottom > promptActions.top)
      };
    });
    metrics.thumbnailRequests = requests.filter((url) => url.includes('/thumbs/')).length;
    metrics.fullImageRequests = requests.filter((url) => url.includes('/images/gallery-')).length;
    metrics.mediaLayoutShift = Math.abs(firstBox.height - metrics.media.height);
    await page.screenshot({ path: `${output}/inspiration-layout-${phase}-${viewport.width}.png`, fullPage: true });
    await page.locator('.gallerySearch input').fill('No-such-inspiration');
    await page.waitForTimeout(250);
    metrics.emptyState = await page.locator('.inspirationCanvasGrid .workspaceEmptyPanel').count();
    if (!baseline) {
      assert.equal(metrics.horizontalOverflow, false, 'Gallery should fit the viewport.');
      assert.equal(metrics.filterOverflow, false, 'Every filter must fit the viewport.');
      assert(metrics.categorySelect.width >= 100, 'Category text must remain readable on narrow screens.');
      assert.equal(metrics.categorySelect.height, 32, 'Category height must align with the compact filter band.');
      assert.equal(metrics.promptTitleOverlapsActions, false, 'Prompt actions must not cover the title.');
      assert.equal(metrics.fullImageRequests, 0, 'Gallery must use thumbnails before preview.');
      assert.equal(metrics.mediaLayoutShift, 0, 'Thumbnail loading must preserve geometry.');
      assert.equal(metrics.emptyState, 1, 'A failed search needs an actionable empty state.');
      assert.equal(metrics.imageCards, 12);
      assert.equal(metrics.promptCards, 6);
      if (viewport.width < 500) assert(metrics.thumbnailRequests < 6, 'Mobile must defer distant thumbnails.');
    }
    if (baseline) {
      await page.locator('.gallerySearch input').fill('');
    } else {
      await page.locator('.galleryEmptyState .secondaryButton').click();
      assert.equal(await page.locator('.gallerySearch input').inputValue(), '');
      assert(await page.locator('.gallerySearch input').evaluate((element) => element === document.activeElement), 'Reset should restore search focus.');
    }
    await page.locator('.caseTileMain').first().waitFor();
    const card = page.locator('.caseTileMain').first();
    await card.focus();
    await page.keyboard.press('Enter');
    await page.locator('.lightboxOverlay').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.lightboxOverlay').waitFor({ state: 'detached' });
    metrics.previewRestoresFocus = await card.evaluate((element) => element === document.activeElement);
    if (!baseline) {
      assert(metrics.previewRestoresFocus, 'Escape should return keyboard focus to the card.');
      await page.locator('.inspirationCanvasGrid > .caseTile').last().scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const cards = [...document.querySelectorAll('.inspirationCanvasGrid > .caseTile')];
        const image = cards.at(-1)?.querySelector('.caseMedia img');
        return image?.complete && image.naturalWidth > 0;
      });
      metrics.scrolledThumbnailRequests = requests.filter((url) => url.includes('/thumbs/')).length;
      if (viewport.width < 500) assert(metrics.scrolledThumbnailRequests > metrics.thumbnailRequests, 'Scrolling should resolve deferred thumbnails.');
      await page.locator('.promptOnlyZone').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/inspiration-prompts-${viewport.width}.png` });
      await page.locator('.galleryImageLoadMore').click();
      assert.equal(await page.locator('.inspirationCanvasGrid > .caseTile').count(), 24);
      assert.equal(await page.locator('.promptOnlyZone .caseTile').count(), 6, 'Image expansion must not expand prompts.');
      await page.locator('.galleryPromptLoadMore').click();
      assert.equal(await page.locator('.promptOnlyZone .caseTile').count(), 12);
      await page.locator('.gallerySourceSwitch button').nth(2).click();
      assert.equal(await page.locator('.inspirationCanvasGrid > .caseTile').count(), 12);
      assert.equal(await page.locator('.promptOnlyZone').count(), 0);
      assert.equal(await page.locator('.galleryImageLoadMore').count(), 0, 'Source totals must drive pagination.');
      await page.locator('.gallerySourceSwitch button').first().click();
      await page.locator('.galleryCategoryFilter select').selectOption('Portraits');
      assert.equal(await page.locator('.promptOnlyZone').count(), 0);
      await page.locator('.galleryCategoryFilter select').selectOption('All');
      const favorite = page.locator('.favoriteMiniButton').first();
      await favorite.click();
      assert.equal(await favorite.getAttribute('aria-pressed'), 'true');
      await page.locator('.galleryFavoritesFilter').click();
      assert.equal(await page.locator('.inspirationCanvasGrid > .caseTile').count(), 1);
      await page.locator('.galleryFavoritesFilter').click();
      await page.locator('.gallerySearch input').fill('Prompt-only composition');
      await page.waitForFunction(() => document.querySelectorAll('.promptOnlyZone .caseTile').length === 12);
      await page.locator('.galleryPromptLoadMore').click();
      assert.equal(await page.locator('.promptOnlyZone .caseTile').count(), 15);
      assert.equal(await page.locator('.galleryPromptLoadMore').count(), 0, 'No dead load-more button on prompt-only pages.');
      await page.locator('.gallerySearch input').fill('Product study 01');
      await page.waitForFunction(() => document.querySelectorAll('.inspirationCanvasGrid > .caseTile').length === 1);
      await page.locator('.caseTileMain').first().click();
      await page.locator('.lightboxOverlay').waitFor();
      for (let step = 0; step < 7; step++) {
        await page.keyboard.press('Tab');
        assert(await page.locator('.lightboxOverlay').evaluate((element) => element.contains(document.activeElement)), 'Preview must contain keyboard focus.');
      }
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.gallerySearch input').inputValue(), 'Product study 01', 'Closing preview must preserve search.');
      assert.equal(await page.locator('.inspirationCanvasGrid > .caseTile').count(), 1);
      await page.locator('.gallerySearch input').fill('');
      await page.locator('.galleryKindSwitch button').nth(1).click();
      await page.locator('.videoInspirationTile').first().click();
      await page.locator('.lightboxOverlay').waitFor();
      assert.match(await page.locator('.lightboxPromptPanel').innerText(), /Video prompt/);
      await page.keyboard.press('Escape');
      await page.locator('.galleryWorkspaceActions > .primaryAction').click();
      await page.locator('.creationDesk textarea').waitFor();
      assert.equal(await page.locator('.creationDesk textarea').first().inputValue(), existingPrompt, 'Preview must not mutate the composer.');
    }
    assert.equal(requests.filter((url) => url.includes('example.invalid')).length, 0);
    assert.deepEqual(errors, []);
    results.push(metrics);
    await page.close();
  }
  await writeFile(`${output}/inspiration-layout-${phase}.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ ok: true, phase, results }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}

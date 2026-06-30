#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_SOURCES = [
  {
    id: 'evolink-awesome-gpt-image-2-api-prompts',
    name: 'EvoLinkAI/awesome-gpt-image-2-API-and-Prompts',
    url: 'https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts',
    api: 'https://api.github.com/repos/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/commits/HEAD'
  },
  {
    id: 'pyth0nb3st-awesome-gpt-image-2',
    name: 'pyth0nb3st/awesome-gpt-image-2',
    url: 'https://github.com/pyth0nb3st/awesome-gpt-image-2',
    api: 'https://api.github.com/repos/pyth0nb3st/awesome-gpt-image-2/commits/HEAD'
  }
];

const libraryDir = path.resolve(process.env.STUDIO_LIBRARY_DIR || path.join(process.cwd(), 'public'));
const outputPath = process.env.STUDIO_INSPIRATION_SOURCE_REPORT
  ? path.resolve(process.env.STUDIO_INSPIRATION_SOURCE_REPORT)
  : '';

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function githubHead(source) {
  const response = await fetch(source.api, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'image-agent-studio-source-check/1.0'
    }
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const payload = await response.json();
  return {
    sha: payload.sha || '',
    date: payload.commit?.committer?.date || payload.commit?.author?.date || '',
    message: String(payload.commit?.message || '').split('\n')[0].slice(0, 180),
    htmlUrl: payload.html_url || source.url
  };
}

async function main() {
  const inspirations = await readJson(path.join(libraryDir, 'inspirations.json'), { cases: [], sourceCounts: [] });
  const cases = Array.isArray(inspirations.cases) ? inspirations.cases : [];
  const sourceCounts = Array.isArray(inspirations.sourceCounts) ? inspirations.sourceCounts : [];
  const report = {
    ok: true,
    checkedAt: new Date().toISOString(),
    libraryDir,
    local: {
      cases: cases.length,
      imageBearing: cases.filter((item) => item?.image || item?.image_url || item?.thumbnail).length,
      localImages: cases.filter((item) => /^(?:\.\/)?\/?images\//i.test(String(item?.image || ''))).length,
      remoteImages: cases.filter((item) => /^https?:\/\//i.test(String(item?.image || item?.image_url || ''))).length,
      promptOnly: cases.filter((item) => item?.imageUnavailable || !(item?.image || item?.image_url || item?.thumbnail)).length,
      sourceCounts
    },
    sources: []
  };

  for (const source of DEFAULT_SOURCES) {
    try {
      report.sources.push({
        ...source,
        head: await githubHead(source)
      });
    } catch (error) {
      report.ok = false;
      report.sources.push({
        ...source,
        error: error.message
      });
    }
  }

  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[check-inspiration-sources] ${error.stack || error.message}`);
  process.exit(1);
});

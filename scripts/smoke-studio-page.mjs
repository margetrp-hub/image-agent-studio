import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const targetUrl = process.argv[2] || process.env.STUDIO_SMOKE_URL || 'https://studio.ohlao.cfd/studio/';
const outputDir = path.resolve(process.cwd(), 'output');
fs.mkdirSync(outputDir, { recursive: true });

const screenshotPath = path.join(outputDir, 'studio-smoke.png');
const command = process.platform === 'win32' ? 'cmd.exe' : 'npx';
const playwrightArgs = [
  '-y',
  'playwright',
  'screenshot',
  '--viewport-size=1365,900',
  '--wait-for-timeout=8000',
  targetUrl,
  screenshotPath
];
const commandArgs = process.platform === 'win32'
  ? ['/d', '/c', 'npx', ...playwrightArgs]
  : playwrightArgs;

execFileSync(command, commandArgs, { stdio: 'inherit' });

const stat = fs.statSync(screenshotPath);
if (stat.size < 20_000) {
  throw new Error(`Smoke screenshot is too small: ${stat.size} bytes`);
}

console.log(`Smoke screenshot: ${screenshotPath}`);

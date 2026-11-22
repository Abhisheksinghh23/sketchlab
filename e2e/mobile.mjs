// Quick mobile-width render check.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4174;
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="world-canvas"]');
await page.click('[data-testid="play-btn"]');
await page.waitForTimeout(2000);
await page.screenshot({ path: SHOTS + '7-mobile.png' });
console.log(errors.length ? `ERRORS: ${errors.join(' | ')}` : 'mobile render ok');
await browser.close();
server.kill();
process.exit(0);

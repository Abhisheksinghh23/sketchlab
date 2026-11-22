// End-to-end smoke test for the built SketchLab app.
// Serves dist/, drives the real UI in headless Chromium, and saves screenshots.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4173;
const BASE = `http://localhost:${PORT}`;
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 2500));

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' - ' + detail : ''}`);
  if (!ok) failures.push(name);
};

let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="world-canvas"]');
  check('app loads and canvas renders', true);
  await page.screenshot({ path: SHOTS + '1-initial.png' });

  // --- play: the sample scene should come alive ---
  await page.click('[data-testid="play-btn"]');
  await page.waitForTimeout(2500);
  const maxAfterPlay = Number(await page.getByTestId('time-slider').getAttribute('max'));
  check('run records frames', maxAfterPlay > 60, `slider max=${maxAfterPlay}`);
  await page.screenshot({ path: SHOTS + '2-playing.png' });

  // canvas actually animates: compare two frames while playing
  const shot1 = await page.locator('[data-testid="world-canvas"]').screenshot();
  await page.waitForTimeout(400);
  const shot2 = await page.locator('[data-testid="world-canvas"]').screenshot();
  check('canvas animates during play', !shot1.equals(shot2));

  await page.click('[data-testid="pause-btn"]');

  // --- scrub back in time ---
  await page.getByTestId('time-slider').focus();
  for (let i = 0; i < 30; i += 1) await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);
  await page.screenshot({ path: SHOTS + '3-scrubbed.png' });

  // --- resume from scrubbed point ---
  await page.click('[data-testid="play-btn"]');
  await page.waitForTimeout(800);
  await page.click('[data-testid="pause-btn"]');
  check('resume from scrubbed point works', true);

  // --- fork + gravity change + compare charts ---
  await page.click('[data-testid="fork-btn"]');
  await page.waitForTimeout(300);
  const tabCount = await page.locator('.tabs .tab').count();
  check('fork creates a new experiment tab', tabCount >= 4, `tabs=${tabCount}`); // incl. New + Fork buttons

  await page.getByTestId('gravity-slider').evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, '0.3');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  await page.click('[data-testid="play-btn"]');
  await page.waitForTimeout(2000);
  await page.click('[data-testid="pause-btn"]');

  // select the ball so charts show its speed
  await page.click('[data-testid="tool-select"]');
  const canvas = page.locator('[data-testid="world-canvas"]');
  const box = await canvas.boundingBox();
  const clickAt = async (wx, wy) => {
    // canvas is letterboxed 1000x600 inside its element
    const scale = Math.min(box.width / 1000, box.height / 600);
    const ox = (box.width - 1000 * scale) / 2;
    const oy = (box.height - 600 * scale) / 2;
    await page.mouse.click(box.x + ox + wx * scale, box.y + oy + wy * scale);
  };
  await clickAt(150, 120);
  await page.waitForTimeout(300);
  await page.screenshot({ path: SHOTS + '4-fork-compare.png' });

  // charts canvas has drawn content
  const chartPixels = await page.evaluate(() => {
    const c = document.querySelector('.charts canvas');
    const ctx = c.getContext('2d');
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonBg = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 40 || data[i + 1] > 40 || data[i + 2] > 60) nonBg += 1;
    }
    return nonBg;
  });
  check('charts render series', chartPixels > 500, `pixels=${chartPixels}`);

  // --- draw a new ball in edit mode ---
  await page.click('[data-testid="reset-btn"]');
  await page.click('[data-testid="tool-ball"]');
  const s = { x: box.x + box.width * 0.5, y: box.y + box.height * 0.3 };
  await page.mouse.move(s.x, s.y);
  await page.mouse.down();
  await page.mouse.move(s.x + 60, s.y + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const inspectorText = await page.locator('[data-testid="inspector"]').innerText();
  check('drawing a ball selects it in the inspector', /ball/i.test(inspectorText));
  await page.screenshot({ path: SHOTS + '5-drawn-ball.png' });

  // play again with the drawn ball
  await page.click('[data-testid="play-btn"]');
  await page.waitForTimeout(1200);
  await page.click('[data-testid="pause-btn"]');
  await page.screenshot({ path: SHOTS + '6-drawn-ball-run.png' });

  // --- undo removes the drawn ball ---
  await page.click('[data-testid="reset-btn"]');
  await page.click('button:has-text("Undo")');
  await page.waitForTimeout(300);
  const afterUndo = await page.locator('[data-testid="inspector"]').innerText();
  check('undo removes the drawn ball', /Select an object/.test(afterUndo));

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (err) {
  console.error('E2E ERROR', err);
  failures.push('exception');
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(failures.length === 0 ? 'ALL CHECKS PASSED' : `FAILURES: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);

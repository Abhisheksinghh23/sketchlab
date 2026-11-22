// End-to-end checks against the DEPLOYED site (GitHub Pages).
// Exercises desktop and mobile(touch) flows: select, play, charts, fork+compare,
// persistence across reload, undo/reset safety, touch draw, scroll, overflow.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.LIVE_URL || 'https://abhisheksinghh23.github.io/sketchlab/';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const WORLD_W = 1000;
const WORLD_H = 600;
const results = [];
const ok = (name, cond) => {
  results.push([name, !!cond]);
  console.log(`${cond ? 'ok' : 'FAIL'} - ${name}`);
};

const browser = await chromium.launch();

async function worldToPage(page, wx, wy) {
  const box = await page.getByTestId('world-canvas').boundingBox();
  const scale = Math.min(box.width / WORLD_W, box.height / WORLD_H);
  const ox = (box.width - WORLD_W * scale) / 2;
  const oy = (box.height - WORLD_H * scale) / 2;
  return { x: box.x + ox + wx * scale, y: box.y + oy + wy * scale };
}

// ---------------- desktop ----------------
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=world-canvas]');
ok('live: app boots', await page.getByTestId('play-btn').isVisible());

// select the ball while stopped
let p = await worldToPage(page, 150, 120);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(200);
const inspectorText = await page.getByTestId('inspector').innerText();
ok('live: ball selected in inspector', /friction/i.test(inspectorText));

// play with selection active -> live chart of that object
await page.getByTestId('play-btn').click();
await page.waitForTimeout(2500);
await page.getByTestId('pause-btn').click();
await page.waitForTimeout(400);
await page.screenshot({ path: SHOTS + 'live-1-selected-live-chart.png' });
const t1 = await page.locator('.time-readout').innerText();
ok(`live: sim advanced (${t1.trim()})`, parseFloat(t1.replace(/[^0-9.]/g, '')) > 1.5);

// total energy chart
await page.getByTestId('metric-energy').click();
await page.waitForTimeout(300);
await page.screenshot({ path: SHOTS + 'live-2-energy-chart.png' });

// fork, change gravity, run, compare against original with object selected
await page.getByTestId('fork-btn').click();
await page.waitForTimeout(300);
await page.getByTestId('gravity-slider').fill('0.3');
await page.getByTestId('play-btn').click();
await page.waitForTimeout(2200);
await page.getByTestId('pause-btn').click();
await page.getByTestId('metric-speed').click();
await page.waitForTimeout(300);
const compareVal = await page.getByTestId('compare-select').inputValue();
ok('live: fork auto-compares to original', compareVal !== '');
await page.screenshot({ path: SHOTS + 'live-3-fork-compare-selected.png' });

// persistence across reload
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid=world-canvas]');
const tabs = await page.locator('.tabs .tab[role=tab]').count();
ok('live: two experiments persisted after reload', tabs === 2);
ok('live: reload resumes stopped', await page.getByTestId('play-btn').isVisible());

// undo safety on pristine experiment
await page.locator('.tabs .tab[role=tab]').first().click();
await page.waitForTimeout(200);
ok('live: undo disabled with empty history', await page.getByRole('button', { name: 'Undo' }).isDisabled());
ok('live: redo disabled with empty future', await page.getByRole('button', { name: 'Redo' }).isDisabled());

// reset restores t=0 on the fork tab
await page.locator('.tabs .tab[role=tab]').nth(1).click();
await page.waitForTimeout(200);
await page.getByTestId('reset-btn').click();
const t0 = await page.locator('.time-readout').innerText();
ok('live: reset returns to t=0', parseFloat(t0.replace(/[^0-9.]/g, '')) === 0);
await page.screenshot({ path: SHOTS + 'live-4-after-reload.png' });

ok('live: no page errors', errors.length === 0);
if (errors.length) console.log('errors:', errors.slice(0, 3));
await page.close();

// ---------------- mobile ----------------
const mob = await browser.newPage({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const merr = [];
mob.on('pageerror', (e) => merr.push(String(e)));
await mob.goto(BASE, { waitUntil: 'networkidle' });
await mob.waitForSelector('[data-testid=world-canvas]');
await mob.screenshot({ path: SHOTS + 'live-5-mobile-initial.png' });

// touch-select the ball
const q = await worldToPage(mob, 150, 120);
await mob.touchscreen.tap(q.x, q.y);
await mob.waitForTimeout(250);
const mInsp = await mob.getByTestId('inspector').innerText();
ok('mobile: tap selects ball', /friction/i.test(mInsp));

// touch play/pause
await mob.getByTestId('play-btn').tap();
await mob.waitForTimeout(1800);
await mob.getByTestId('pause-btn').tap();
const mt = await mob.locator('.time-readout').innerText();
ok(`mobile: sim ran (${mt.trim()})`, parseFloat(mt.replace(/[^0-9.]/g, '')) > 0.5);
await mob.screenshot({ path: SHOTS + 'live-6-mobile-playing.png' });

// reset, then draw a ball by touch-drag (pointer events)
await mob.getByTestId('reset-btn').tap();
await mob.getByTestId('tool-ball').tap();
const d = await worldToPage(mob, 330, 60);
await mob.mouse.move(d.x, d.y);
await mob.mouse.down();
await mob.mouse.move(d.x + 45, d.y + 30, { steps: 6 });
await mob.mouse.up();
await mob.waitForTimeout(250);
ok('mobile: drew ball (undo now available)', await mob.getByRole('button', { name: 'Undo' }).isEnabled());

// play with the drawn ball
await mob.getByTestId('play-btn').tap();
await mob.waitForTimeout(1200);
await mob.getByTestId('pause-btn').tap();
await mob.screenshot({ path: SHOTS + 'live-7-mobile-drawn-run.png' });

// scroll down to the charts
await mob.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await mob.waitForTimeout(400);
ok('mobile: charts reachable by scroll', await mob.locator('[data-testid=charts] canvas').isVisible());
await mob.screenshot({ path: SHOTS + 'live-8-mobile-scrolled.png' });

const overflow = await mob.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth
);
ok(`mobile: no horizontal overflow (${overflow}px)`, overflow <= 1);
ok('mobile: no page errors', merr.length === 0);
if (merr.length) console.log('mobile errors:', merr.slice(0, 3));

await browser.close();
const fails = results.filter((r) => !r[1]);
console.log(`\n${results.length - fails.length}/${results.length} live checks passed`);
process.exit(fails.length ? 1 : 0);

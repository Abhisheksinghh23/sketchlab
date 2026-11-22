import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await p.goto('https://abhisheksinghh23.github.io/sketchlab/', { waitUntil: 'networkidle' });
await p.waitForSelector('[data-testid=world-canvas]');
const wide = await p.evaluate(() => {
  const out = [];
  const vw = document.documentElement.clientWidth;
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width > vw + 0.5 || r.right > vw + 0.5) {
      out.push(`${el.tagName}.${el.className?.toString().slice(0,40)} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
    }
  }
  return out.slice(0, 15);
});
console.log(wide.join('\n'));
await b.close();

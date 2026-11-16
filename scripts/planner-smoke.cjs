// Opens the built planner in a headless browser, runs Analyse and Generate, and reports the result.
// Usage: node scripts/planner-smoke.cjs planner/dist/planner.html
// Uses the Chromium that is preinstalled in the sandbox; set CHROME_PATH to override.
const { chromium } = require('playwright-core');
const path = require('node:path');

(async () => {
  const file = path.resolve(process.argv[2] || 'planner/dist/planner.html');
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + file, { waitUntil: 'load' });
  await page.click('#analyse');
  await page.click('#go');
  await page.waitForFunction(() => document.querySelectorAll('#plans article').length > 0, null, { timeout: 300000 });
  const status = await page.textContent('#status');
  const cards = await page.locator('#plans article').count();
  console.log(JSON.stringify({ status, cards, errors }, null, 2));
  await browser.close();
  if (errors.length || cards === 0) process.exit(1);
})().catch((e) => {
  console.error('planner smoke test failed:', e.message);
  process.exit(1);
});

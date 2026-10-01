const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SCREENSHOT_DIR = path.resolve(__dirname, 'test-screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  console.log('Testing redesigned ORCA dashboard via Edge Chromium...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1600,1000'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  console.log('Navigating to http://localhost:3000/dashboard...');
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle2', timeout: 20000 });

  // Wait 3 seconds for Leaflet and telemetry to populate
  await new Promise((r) => setTimeout(r, 3000));

  // Screenshot 1: Redesigned Dashboard Initial State
  const initialShot = path.join(SCREENSHOT_DIR, '01_figma_redesign_initial.png');
  await page.screenshot({ path: initialShot, fullPage: true });
  console.log('Saved initial state screenshot:', initialShot);

  // Check top nav elements
  const brandText = await page.$eval('header', (el) => el.innerText).catch(() => 'header not found');
  console.log('Header text detected:', brandText.replace(/\n+/g, ' | '));

  // Check stats bar
  const statsCount = await page.$$eval('[aria-label="Oceanographic Telemetry Summary"] > div', (els) => els.length).catch(() => 0);
  console.log('Ocean Stats cards rendered:', statsCount);

  // Submit inquiry via bottom Voice & Chat Bar
  console.log('Submitting question via Voice & Chat Bar...');
  const inputSelector = 'input[placeholder*="Ask ORCA"]';
  await page.waitForSelector(inputSelector, { timeout: 5000 });
  await page.type(inputSelector, 'Is sea condition safe to sail today from Mangalore to PFZ zones?');

  const askBtn = await page.waitForSelector('button[aria-label="Send query"]', { timeout: 5000 });
  await askBtn.click();

  console.log('Waiting for ORCA advisory response...');
  // Wait up to 15s for the advisory card to populate
  await new Promise((r) => setTimeout(r, 8000));

  // Screenshot 2: Live Advisory & Forecast Charts
  const advisoryShot = path.join(SCREENSHOT_DIR, '02_figma_redesign_advisory.png');
  await page.screenshot({ path: advisoryShot, fullPage: true });
  console.log('Saved advisory response screenshot:', advisoryShot);

  // Test switching to Dialogue History tab
  console.log('Testing Dialogue History tab...');
  const historyBtn = await page.$('button:has-text("Dialogue History"), button:has-text("対話")');
  if (historyBtn) {
    await historyBtn.click();
    await new Promise((r) => setTimeout(r, 1000));
    const historyShot = path.join(SCREENSHOT_DIR, '03_figma_redesign_history.png');
    await page.screenshot({ path: historyShot, fullPage: true });
    console.log('Saved dialogue history screenshot:', historyShot);
  }

  await browser.close();
  console.log('All tests completed successfully!');
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

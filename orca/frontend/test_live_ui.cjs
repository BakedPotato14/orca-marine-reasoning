const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SCREENSHOT_DIR = path.resolve(__dirname, 'test-screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  console.log('Launching Edge Chromium via puppeteer-core...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const results = {
    redirectDashboard: false,
    statsBar: null,
    mapTabs: {},
    rawQueryResponse: null,
    verdictBadge: null,
    audioSrcPrefix: null,
    advisoryMapRendered: null,
    evidenceCardsCount: 0,
    forecastChartRendered: false,
    followUpResponse: null,
    conversationHistoryCount: 0,
    mapPageOk: false,
    pfzPageOk: false,
  };

  // Listen to network responses to capture raw JSON
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/api/orca/query') && res.request().method() === 'POST') {
      try {
        const json = await res.json();
        console.log('\n[NETWORK] Captured raw /api/orca/query response:');
        console.log(' - verdict_color:', json.verdict_color);
        console.log(' - audio_base64 prefix:', json.audio_base64?.slice(0, 40));
        console.log(' - detected_language:', json.detected_language);
        console.log(' - evidence count:', json.evidence?.length);
        console.log(' - forecast_series count:', json.forecast_series?.length);
        console.log(' - map_geojson features count:', json.map_geojson?.features?.length);
        results.rawQueryResponse = {
          verdict_color: json.verdict_color,
          audio_base64_prefix: json.audio_base64?.slice(0, 40),
          detected_language: json.detected_language,
          evidence_count: json.evidence?.length,
          forecast_series_count: json.forecast_series?.length,
          features_count: json.map_geojson?.features?.length,
        };
      } catch (e) {
        console.error('Error parsing /api/orca/query JSON:', e.message);
      }
    }
  });

  try {
    // 1. Navigate to http://localhost:3000
    console.log('\n1. Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
    const currentUrl = page.url();
    console.log('Current URL after initial load:', currentUrl);
    results.redirectDashboard = currentUrl.includes('/dashboard');

    // 2. Check OceanStatsBar
    await page.waitForSelector('.glass-card', { timeout: 15000 });
    const statsText = await page.evaluate(() => {
      const el = document.querySelector('.stats-ticker') || document.body;
      return el ? el.innerText.slice(0, 300) : '';
    });
    console.log('\n2. OceanStatsBar summary excerpt:', statsText.replace(/\n+/g, ' | '));
    results.statsBar = statsText.slice(0, 150);

    // 3. Verify MapPanel iframe and tabs
    console.log('\n3. Testing MapPanel tabs...');
    const getIframeSrc = async () => {
      return page.evaluate(() => {
        const iframe = document.querySelector('iframe');
        return iframe ? iframe.getAttribute('src') : null;
      });
    };

    // Wait a bit for initial iframe to attach
    await new Promise((r) => setTimeout(r, 2000));
    results.mapTabs.ocean = await getIframeSrc();
    console.log(' - Ocean tab iframe src:', results.mapTabs.ocean);

    // Click "PFZ Zones" tab
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const pfzBtn = btns.find((b) => b.innerText.includes('PFZ Zones'));
      if (pfzBtn) pfzBtn.click();
    });
    await new Promise((r) => setTimeout(r, 2500));
    results.mapTabs.pfz = await getIframeSrc();
    console.log(' - PFZ tab iframe src:', results.mapTabs.pfz);

    // Click "Safety & Hazards" tab
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const safetyBtn = btns.find((b) => b.innerText.includes('Safety & Hazards'));
      if (safetyBtn) safetyBtn.click();
    });
    await new Promise((r) => setTimeout(r, 2500));
    results.mapTabs.safety = await getIframeSrc();
    console.log(' - Safety tab iframe src:', results.mapTabs.safety);

    // Switch back to Ocean Overview
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const oceanBtn = btns.find((b) => b.innerText.includes('Ocean Overview'));
      if (oceanBtn) oceanBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    // 4. Submit Query: "Is it safe to sail today from Mangalore?"
    console.log('\n4. Submitting initial query: "Is it safe to sail today from Mangalore?"...');
    const inputSelector = 'input[type="text"][placeholder*="Ask about safety"]';
    await page.waitForSelector(inputSelector, { timeout: 10000 });
    await page.type(inputSelector, 'Is it safe to sail today from Mangalore?');

    // Click submit button
    await page.click('button[type="submit"]');

    console.log('Query submitted. Waiting for response (up to 45s)...');
    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return text.includes('SAFE') || text.includes('CAUTION') || text.includes('UNSAFE');
      },
      { timeout: 45000 }
    );

    // Inspect VerdictBadge
    results.verdictBadge = await page.evaluate(() => {
      const text = document.body.innerText;
      let verdict = 'UNKNOWN';
      if (text.includes('SAFE') && !text.includes('UNSAFE')) verdict = 'SAFE';
      else if (text.includes('CAUTION')) verdict = 'CAUTION';
      else if (text.includes('UNSAFE')) verdict = 'UNSAFE';
      return verdict;
    });
    console.log(' - Observed verdict badge:', results.verdictBadge);

    // Inspect audio player
    results.audioSrcPrefix = await page.evaluate(() => {
      const audio = document.querySelector('audio');
      return audio ? audio.getAttribute('src')?.slice(0, 45) : null;
    });
    console.log(' - Observed audio element src prefix:', results.audioSrcPrefix);

    // Inspect AdvisoryMap (standalone Leaflet)
    results.advisoryMapRendered = await page.evaluate(() => {
      const leafletContainer = document.querySelector('.leaflet-container');
      const markers = document.querySelectorAll('.leaflet-marker-icon');
      return {
        hasLeaflet: !!leafletContainer,
        markerCount: markers.length,
      };
    });
    console.log(' - Observed AdvisoryMap:', JSON.stringify(results.advisoryMapRendered));

    // Inspect Evidence Cards
    results.evidenceCardsCount = await page.evaluate(() => {
      const text = document.body.innerText;
      let count = 0;
      if (text.includes('Open-Meteo')) count++;
      if (text.includes('Sea-State Forecast')) count++;
      if (text.includes('EEZ')) count++;
      if (text.includes('INCOIS')) count++;
      return count;
    });
    console.log(' - Observed Evidence sources matched:', results.evidenceCardsCount);

    // Inspect Forecast Chart
    results.forecastChartRendered = await page.evaluate(() => {
      const svg = document.querySelector('.recharts-responsive-container, .recharts-surface, svg.recharts-surface');
      return !!svg;
    });
    console.log(' - Observed Forecast chart SVG rendered:', results.forecastChartRendered);

    // Save screenshot of Dashboard with Advisory
    const dashScreenshotPath = path.join(SCREENSHOT_DIR, 'dashboard_advisory.png');
    await page.screenshot({ path: dashScreenshotPath, fullPage: true });
    console.log(' - Saved dashboard screenshot to:', dashScreenshotPath);

    // 5. Submit Follow-up Query
    console.log('\n5. Submitting follow-up query: "What is the wind forecast?"...');
    await page.type(inputSelector, 'What is the wind forecast?');
    await page.click('button[type="submit"]');

    console.log('Waiting for follow-up response...');
    await new Promise((r) => setTimeout(r, 15000));

    // Check conversation history
    console.log('\n6. Checking Conversation History sub-tab...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const histBtn = btns.find((b) => b.innerText.includes('Conversation History'));
      if (histBtn) histBtn.click();
    });
    await new Promise((r) => setTimeout(r, 2000));

    results.conversationHistoryCount = await page.evaluate(() => {
      const text = document.body.innerText;
      const matches = (text.match(/Is it safe to sail today from Mangalore\?/g) || []).length;
      const followUpMatches = (text.match(/What is the wind forecast\?/g) || []).length;
      return matches + followUpMatches;
    });
    console.log(' - Observed conversation history messages found:', results.conversationHistoryCount);

    // 6. Test /map route
    console.log('\n7. Testing /map page...');
    await page.goto('http://localhost:3000/map', { waitUntil: 'networkidle2', timeout: 25000 });
    results.mapPageOk = await page.evaluate(() => {
      const iframe = document.querySelector('iframe');
      return !!iframe && (iframe.getAttribute('src')?.includes('/api/geo/maps') ?? false);
    });
    const mapScreenshotPath = path.join(SCREENSHOT_DIR, 'map_explorer.png');
    await page.screenshot({ path: mapScreenshotPath, fullPage: true });
    console.log(' - /map page verified. Iframe present:', results.mapPageOk);

    // 7. Test /pfz route
    console.log('\n8. Testing /pfz page...');
    await page.goto('http://localhost:3000/pfz', { waitUntil: 'networkidle2', timeout: 25000 });
    results.pfzPageOk = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Potential Fishing Zones') || text.includes('PFZ') || text.includes('Hotspot');
    });
    const pfzScreenshotPath = path.join(SCREENSHOT_DIR, 'pfz_table.png');
    await page.screenshot({ path: pfzScreenshotPath, fullPage: true });
    console.log(' - /pfz page verified. Hotspots table loaded:', results.pfzPageOk);

    console.log('\n========================================');
    console.log('VERIFICATION SUMMARY COMPLETE');
    console.log('========================================');
    console.log(JSON.stringify(results, null, 2));

    fs.writeFileSync(path.resolve(__dirname, 'verification_results.json'), JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('Error during live verification:', err);
  } finally {
    await browser.close();
  }
}

run();

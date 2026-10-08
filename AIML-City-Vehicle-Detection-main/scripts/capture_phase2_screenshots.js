const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, '../docs/screenshots/phase2');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function runScreenshotSuite() {
  console.log('[Playwright] Starting Phase 2 Headless Chromium Suite...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Navigate to NetraTrack Dashboard
    console.log('Navigating to http://127.0.0.1:5000...');
    await page.goto('http://127.0.0.1:5000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // 2. Switch to ANPR Lab tab
    console.log('Switching to ANPR Lab tab...');
    await page.click('button:has-text("ANPR Lab")');
    await page.waitForTimeout(1000);

    // 3. Test Image ANPR Pipeline Upload & Stage Visualization
    const sampleImagePath = path.join(__dirname, '../data/synthetic_dataset/sample_000_day.jpg');
    console.log('Uploading sample image:', sampleImagePath);

    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(sampleImagePath);
    await page.waitForTimeout(500);

    // Enter ground truth for verification test
    await page.fill('input[placeholder="e.g. TN37AB1234"]', '21BH3093ZC');

    // Click Run ANPR Test
    console.log('Clicking Run ANPR Test...');
    await page.click('button:has-text("Run ANPR Test")');

    // Wait for stage crops and detection output
    await page.waitForSelector('text=Stage-by-Stage Pre-Processing Crops', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const shot1 = path.join(SCREENSHOT_DIR, '01_anpr_lab_image_analysis.png');
    await page.screenshot({ path: shot1, fullPage: false });
    console.log('Saved screenshot 1:', shot1);

    // 4. Capture Performance Panel & Ground-Truth Verdict
    const shot2 = path.join(SCREENSHOT_DIR, '02_anpr_lab_performance_and_verdict.png');
    await page.screenshot({ path: shot2, fullPage: false });
    console.log('Saved screenshot 2:', shot2);

    // 5. Test Video ANPR Pipeline & Job Polling Flow
    const sampleVideoPath = path.join(__dirname, '../data/video_dataset/clip_01.mp4');
    console.log('Uploading sample video:', sampleVideoPath);
    await fileInput.setInputFiles(sampleVideoPath);
    await page.waitForTimeout(500);

    console.log('Clicking Run ANPR Test (Video)...');
    await page.click('button:has-text("Run ANPR Test")');

    // Wait for progress bar and job completion
    console.log('Waiting for video job completion...');
    await page.waitForSelector('text=Video Multi-Frame Consensus Job', { timeout: 15000 });
    await page.waitForSelector('text=Multi-Frame Consensus Detected Plates', { timeout: 45000 });
    await page.waitForTimeout(2000);

    const shot3 = path.join(SCREENSHOT_DIR, '03_anpr_lab_video_job_summary.png');
    await page.screenshot({ path: shot3, fullPage: false });
    console.log('Saved screenshot 3:', shot3);

    console.log('[Playwright] All Phase 2 Screenshots Captured Successfully!');
  } catch (err) {
    console.error('[Playwright Error]', err);
  } finally {
    await browser.close();
  }
}

runScreenshotSuite();

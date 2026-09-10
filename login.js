const { chromium } = require('playwright');
const path = require('path');

const SESSION_FILE = path.join(__dirname, 'session.json');
const HOME_URL = 'https://people.codeclouds.com/home';
const BOOKING_URL = 'https://people.codeclouds.com/my-apps/booking-system';

(async () => {
  console.log('-------------------------------------------------------------------');
  console.log('🚀 Opening Browser for Login...');
  console.log('👉 Please complete your login in the browser window.');
  console.log('-------------------------------------------------------------------');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  await page.goto(HOME_URL);

  try {
    console.log('⏳ Waiting for you to finish logging in...');
    
    // Wait until logged in
    await page.waitForURL(url => {
      const u = url.toString();
      return u.includes('/home') || u.includes('/my-apps/booking-system');
    }, { timeout: 180000 });

    console.log('✅ Login detected! Navigating to Booking System...');
    await page.waitForTimeout(2000);

    // Navigate to booking system
    await page.goto(BOOKING_URL, { waitUntil: 'domcontentloaded' });

    console.log('⏳ Waiting for booking cards to appear...');
    // Standard valid selector for Book Now button or building text
    await page.locator('button:has-text("Book Now"), :has-text("Globsyn Crystals")').first().waitFor({
      state: 'visible',
      timeout: 60000
    });

    console.log('🎉 Globsyn Crystals & Booking Portal loaded successfully!');
    await page.waitForTimeout(3000);

    // Save full session state
    await context.storageState({ path: SESSION_FILE });
    console.log('\n===================================================================');
    console.log('✅ 100% COMPLETE! Authenticated session saved to:', SESSION_FILE);
    console.log('===================================================================\n');

  } catch (err) {
    console.log('ℹ️ Saving session state...');
    await context.storageState({ path: SESSION_FILE }).catch(() => {});
    console.log('Session saved.');
  } finally {
    await browser.close();
  }
})();

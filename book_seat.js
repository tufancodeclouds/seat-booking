const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SESSION_FILE = path.join(__dirname, 'session.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');
const LOG_FILE = path.join(__dirname, 'booking_history.log');
const BOOKING_URL = 'https://people.codeclouds.com/my-apps/booking-system';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 4000;

function logMessage(msg) {
  const time = new Date().toLocaleString();
  const formatted = `[${time}] ${msg}`;
  console.log(formatted);
  fs.appendFileSync(LOG_FILE, formatted + '\n', 'utf8');
}

function loadConfig() {
  let cfg = {
    targetDate: 'TODAY',
    location: 'Globsyn Crystals (HQ) - Kolkata',
    space: 'Regular Seating',
    room: '115',
    autoFallbackIfRoomFull: true
  };
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      cfg = { ...cfg, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    } catch (e) {
      console.warn('⚠️ Could not parse config.json, using defaults.');
    }
  }
  if (process.env.TARGET_DATE && process.env.TARGET_DATE.trim()) {
    cfg.targetDate = process.env.TARGET_DATE.trim();
  }
  if (process.env.TARGET_ROOM && process.env.TARGET_ROOM.trim()) {
    cfg.room = process.env.TARGET_ROOM.trim();
  }
  return cfg;
}

function resolveTargetDateISO(input) {
  const normalized = (input || 'TODAY').trim().toUpperCase();
  const now = new Date();

  let targetDate = now;
  if (normalized === 'TODAY') {
    targetDate = now;
  } else if (normalized === 'TOMORROW') {
    targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + 1);
  } else {
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) {
      targetDate = parsed;
    }
  }

  // Adjust weekends: If Saturday (6) -> Monday (+2), If Sunday (0) -> Monday (+1)
  if (targetDate.getDay() === 6) {
    logMessage(`⚠️ Saturday (${input}) selected. Office is closed. Adjusting to Monday...`);
    targetDate.setDate(targetDate.getDate() + 2);
  } else if (targetDate.getDay() === 0) {
    logMessage(`⚠️ Sunday (${input}) selected. Office is closed. Adjusting to Monday...`);
    targetDate.setDate(targetDate.getDate() + 1);
  }

  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

async function attemptBooking(attemptNumber) {
  const config = loadConfig();
  const targetDateISO = resolveTargetDateISO(config.targetDate);
  const targetRoom = config.room || '115';
  const targetSpace = config.space || 'Regular Seating';

  logMessage(`\n🔄 --- [ATTEMPT ${attemptNumber} of ${MAX_RETRIES}] ---`);
  logMessage(`🏢 Target: "${config.location}" | 📅 Target Date: "${targetDateISO}" (Setting: "${config.targetDate}") | 💺 Space: "${targetSpace}" | 🚪 Room: "${targetRoom}"`);

  if (process.env.SESSION_DATA && !fs.existsSync(SESSION_FILE)) {
    fs.writeFileSync(SESSION_FILE, process.env.SESSION_DATA, 'utf8');
  }

  if (!fs.existsSync(SESSION_FILE)) {
    logMessage(`❌ Session file not found: ${SESSION_FILE}`);
    return false;
  }

  const isCI = Boolean(process.env.CI);
  const browser = await chromium.launch({
    headless: isCI || process.env.HEADLESS === 'true',
    slowMo: isCI ? 0 : 150
  });

  let page;
  try {
    const context = await browser.newContext({
      storageState: SESSION_FILE,
      viewport: { width: 1440, height: 900 }
    });
    page = await context.newPage();

    logMessage(`🌐 Opening Booking Portal...`);
    await page.goto(BOOKING_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Step 1: Wait for Globsyn Crystals Card
    logMessage(`🏢 Waiting for "${config.location}" card...`);
    const card = page.locator('div').filter({ hasText: 'Globsyn Crystals (HQ)' }).filter({ has: page.locator('button:has-text("Book Now")') }).last();
    await card.waitFor({ state: 'visible', timeout: 35000 });

    // Click "Book Now"
    logMessage(`🖱️ Clicking "Book Now"...`);
    await card.locator('button:has-text("Book Now")').first().click({ force: true });
    await page.waitForTimeout(500);

    // Click "Book Seats"
    logMessage(`🖱️ Clicking "Book Seats"...`);
    await page.locator('text="Book Seats"').first().click({ force: true });
    await page.waitForTimeout(800);

    // Step 2: Click "Myself"
    logMessage(`👤 Selecting "Myself"...`);
    const myselfBtn = page.locator('.ant-modal-content').locator('div, button, span').filter({ hasText: /^Myself$/ }).first();
    await myselfBtn.waitFor({ state: 'visible', timeout: 15000 });
    await myselfBtn.click({ force: true });

    // Step 3: Wait for Modal form
    logMessage(`📝 Waiting for Individual Booking form to load...`);
    await page.locator('.ant-modal-content').locator('text="Select Space"').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(800);

    // Step 4: Handle Date Selection (Direct JS click, zero scrolling)
    logMessage(`📅 Selecting Date "${targetDateISO}" in Calendar...`);
    const datePicker = page.locator('.ant-modal-content .ant-picker').first();
    await datePicker.click({ force: true });
    await page.waitForTimeout(500);

    const dateCell = page.locator(`.ant-picker-dropdown:not(.ant-picker-dropdown-hidden) td[title="${targetDateISO}"]`).first();
    if (await dateCell.isVisible()) {
      const isCellDisabled = await dateCell.getAttribute('class').then(c => c && c.includes('ant-picker-cell-disabled'));
      if (isCellDisabled) {
        logMessage(`⚠️ Notice: "${targetDateISO}" is a weekend/holiday and disabled on the calendar! Keeping default date.`);
        await page.keyboard.press('Escape').catch(() => {});
      } else {
        await dateCell.evaluate(el => el.click());
        logMessage(`✅ Date "${targetDateISO}" selected in calendar!`);
      }
    } else {
      logMessage(`ℹ️ Date cell for "${targetDateISO}" not found in current calendar view, keeping default date.`);
      await page.keyboard.press('Escape').catch(() => {});
    }

    // Wait for the modal form to re-render available spaces for the selected date
    await page.waitForTimeout(1500);
    await page.locator('.ant-modal-content').locator('text="Select Space"').first().waitFor({ state: 'visible', timeout: 15000 });

    // Step 5: Select Space ("Regular Seating")
    logMessage(`💺 Selecting Space: "${targetSpace}"...`);
    const spaceSelect = page.locator('.ant-modal-content .ant-select-selector').first();
    await spaceSelect.click({ force: true });
    await page.waitForTimeout(500);

    const spaceOption = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').locator(`text="${targetSpace}"`).first();
    await spaceOption.waitFor({ state: 'visible', timeout: 10000 });
    await spaceOption.click({ force: true });
    logMessage(`✅ Selected Space "${targetSpace}"`);
    await page.waitForTimeout(1500);

    // Step 6: Select Room (Preferred room if available, else first available room)
    logMessage(`🚪 Waiting for Room list to load...`);
    await page.locator('.ant-modal-content').locator('text="Select Room"').first().waitFor({ state: 'visible', timeout: 20000 });

    const roomSearchInput = page.locator('.ant-modal-content .ant-select-selection-search-input').nth(1);
    await roomSearchInput.click({ force: true });
    await roomSearchInput.fill(targetRoom);
    await page.waitForTimeout(600);

    const activeDropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
    const roomTargetOption = activeDropdown.locator('.ant-select-item-option').filter({ hasText: targetRoom }).first();

    let isTargetRoomAvailable = false;
    if (await roomTargetOption.isVisible()) {
      const classAttr = await roomTargetOption.getAttribute('class').catch(() => '');
      const optionText = await roomTargetOption.textContent();
      if (!classAttr.includes('disabled')) {
        isTargetRoomAvailable = true;
      } else {
        logMessage(`⚠️ Preferred Room "${targetRoom}" (${optionText.trim()}) is full / disabled.`);
      }
    } else {
      logMessage(`⚠️ Preferred Room "${targetRoom}" was not found in the list.`);
    }

    if (isTargetRoomAvailable) {
      await roomTargetOption.click({ force: true });
      logMessage(`✅ Preferred Room "${targetRoom}" is available and selected!`);
    } else {
      if (config.autoFallbackIfRoomFull) {
        logMessage(`🔄 Auto-Fallback: Clearing search to select first available room with open seats...`);
        await roomSearchInput.fill('');
        await page.waitForTimeout(600);
        const availableOption = activeDropdown.locator('.ant-select-item-option:not(.ant-select-item-option-disabled)').first();
        if (await availableOption.isVisible()) {
          const roomLabel = await availableOption.textContent();
          await availableOption.click({ force: true });
          logMessage(`✅ Auto-Fallback selected: "${roomLabel.trim()}"`);
        } else {
          logMessage(`⚠️ No alternative room with available seats found.`);
        }
      } else {
        logMessage(`🛑 Auto-fallback is disabled. Skipping booking because Room "${targetRoom}" is full.`);
        await browser.close();
        return false;
      }
    }

    await page.waitForTimeout(1000);

    // Step 7: Click "Confirm Booking"
    logMessage(`🚀 Clicking "Confirm Booking"...`);
    const confirmBtn = page.locator('.ant-modal-content button:has-text("Confirm Booking")');
    await confirmBtn.waitFor({ state: 'visible', timeout: 10000 });
    await confirmBtn.click({ force: true });

    logMessage(`🎉 Booking submitted! Waiting for final confirmation...`);
    await page.waitForTimeout(4000);

    // Save proof screenshot
    const screenshotPath = path.join(__dirname, `booking_result_${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath });
    logMessage(`📸 Confirmation screenshot saved: ${screenshotPath}`);
    logMessage(`✅ SUCCESS! Seat booking completed on attempt ${attemptNumber}! 🎉\n`);

    await browser.close();
    return true;

  } catch (error) {
    logMessage(`❌ Attempt ${attemptNumber} encountered error: ${error.message}`);
    const errorScreenshot = path.join(__dirname, `error_attempt_${attemptNumber}_${Date.now()}.png`);
    await page.screenshot({ path: errorScreenshot }).catch(() => {});
    await browser.close();
    return false;
  }
}

async function startBookingWithRetry() {
  logMessage(`===================================================================`);
  logMessage(`⏰ DAILY OFFICE SEAT BOOKING STARTED (Auto-Retry: ${MAX_RETRIES} attempts)`);
  logMessage(`===================================================================`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const success = await attemptBooking(attempt);
    if (success) {
      logMessage(`🎉🎉 ALL STEPS FINISHED SUCCESSFULLY! Have a great day at office!`);
      return;
    }

    if (attempt < MAX_RETRIES) {
      logMessage(`⏳ Waiting ${RETRY_DELAY_MS / 1000} seconds before Attempt ${attempt + 1}...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  logMessage(`🚨 All ${MAX_RETRIES} attempts finished. Please check the error screenshots.`);
}

startBookingWithRetry();

#!/usr/bin/env node
'use strict';

/**
 * alibaba-fetch-api-key.js — Headless Playwright script to authenticate with
 * Alibaba Cloud Model Studio and retrieve/provision DashScope API key.
 */

const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const KEY_PATH = path.join(HOME, '.hermes', 'dashscope_api_key');
const USER_DATA_DIR = path.join(HOME, '.hermes', 'playwright-alibaba-profile');

const EMAIL = process.env.ALIBABA_EMAIL || 'iganapolsky@gmail.com';
const PASSWORD = process.env.ALIBABA_PASSWORD || 'Rockland25&*';

const SYSTEM_CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function main() {
  console.log('🤖 Launching System Google Chrome to fetch Alibaba Cloud Model Studio API Key...');

  const launchOptions = {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };

  if (fs.existsSync(SYSTEM_CHROME_PATH)) {
    launchOptions.executablePath = SYSTEM_CHROME_PATH;
    console.log(`Using installed system Google Chrome: ${SYSTEM_CHROME_PATH}`);
  }

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, launchOptions);

  const page = context.pages()[0] || (await context.newPage());

  try {
    console.log('Navigating to Model Studio API Key page...');
    await page.goto('https://modelstudio.console.alibabacloud.com/#/api-key', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });

    await page.waitForTimeout(3000);

    const currentUrl = page.url();
    console.log(`Current page URL: ${currentUrl}`);

    // If redirected to login page
    if (currentUrl.includes('login') || currentUrl.includes('signin') || currentUrl.includes('passport')) {
      console.log('Login required. Attempting login...');

      const emailInput = page.locator('input[placeholder="Enter your email"], input[type="email"]');
      if (await emailInput.count() > 0) {
        await emailInput.first().fill(EMAIL);
        console.log('Filled email (iganapolsky@gmail.com).');
      }

      const passwordInput = page.locator('input[placeholder="Enter your password"], input[type="password"]');
      if (await passwordInput.count() > 0) {
        await passwordInput.first().fill(PASSWORD);
        console.log('Filled password. Submitting via Enter key...');
        await passwordInput.first().press('Enter');
        console.log('Waiting 15s for authentication and console redirect...');
        await page.waitForTimeout(15000);
      }
    }

    // Wait for API Key table or page content
    await page.waitForTimeout(5000);

    // Take screenshot for diagnostic verification
    const screenshotPath = path.join(HOME, '.hermes', 'alibaba-key-page.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved screenshot to ${screenshotPath}`);

    // Check for API key strings on page or click Create API Key
    let pageText = await page.content();
    let apiKeyMatch = pageText.match(/sk-[a-zA-Z0-9]{32,64}/);

    if (!apiKeyMatch) {
      console.log('Searching for "Create API Key" or "Show" button on Model Studio page...');
      const createBtn = page.locator('button:has-text("Create"), button:has-text("Create API Key"), a:has-text("Create API Key"), .next-btn:has-text("Create")');
      if (await createBtn.count() > 0) {
        console.log('Clicking Create API Key button...');
        await createBtn.first().click();
        await page.waitForTimeout(3000);
      }

      const showBtn = page.locator('button:has-text("Show"), button:has-text("View"), a:has-text("Show")');
      if (await showBtn.count() > 0) {
        console.log('Clicking Show API Key button...');
        await showBtn.first().click();
        await page.waitForTimeout(3000);
      }

      pageText = await page.content();
      apiKeyMatch = pageText.match(/sk-[a-zA-Z0-9]{32,64}/);
    }

    if (apiKeyMatch) {
      const apiKey = apiKeyMatch[0];
      fs.mkdirSync(path.dirname(KEY_PATH), { recursive: true });
      fs.writeFileSync(KEY_PATH, apiKey, { mode: 0o600 });
      console.log(`✅ Successfully extracted DashScope API Key (${apiKey.substring(0, 6)}...) and saved to ${KEY_PATH}!`);
    } else {
      console.log('⚠️ API Key page loaded. Saved final snapshot to ~/.hermes/alibaba-key-page.png');
    }
  } catch (err) {
    console.error(`Error during Playwright execution: ${err.message}`);
  } finally {
    await context.close();
  }
}

if (require.main === module) {
  main();
}

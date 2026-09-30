#!/usr/bin/env node
'use strict';

// Start the application, then run: node scripts/accessibility.cjs
// Automated WCAG checks complement keyboard and screen-reader review.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5173';
const outputDir = path.resolve('.test-results');
const reports = [];
let browser;

async function scan(page, name) {
  await page.evaluate(() => document.fonts.ready);
  // Scan stable final colours, rather than a card's brief opacity entrance.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => Number.isFinite(animation.effect?.getTiming().iterations))
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  reports.push({ name, violations: results.violations, passes: results.passes.length });
  console.log(
    `${name}: ${results.violations.length} violations; ${results.passes.length} rule passes`,
  );
  for (const violation of results.violations) {
    console.log(`  ${violation.impact}: ${violation.id}`);
    for (const node of violation.nodes) {
      const checks = [...node.any, ...node.all, ...node.none].map((check) => ({
        message: check.message,
        data: check.data,
      }));
      console.log(JSON.stringify({ target: node.target, checks }));
    }
  }
}

async function go(page, name, mobile = false) {
  if (mobile) await page.getByRole('button', { name: 'Toggle menu', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: new RegExp(`^${name}(?:\\s*\\d+)?$`) })
    .click();
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await scan(page, 'Desktop Discover');
  await page.screenshot({
    path: path.join(outputDir, 'accessibility-desktop.png'),
    fullPage: false,
  });
  await page.locator('.card-title').filter({ hasText: 'Old Tokyo, a little slower' }).click();
  await page
    .getByRole('dialog')
    .locator('.vote-row')
    .first()
    .getByRole('button', { name: 'Love it', exact: true })
    .click();
  await scan(page, 'Desktop experience dialog');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await go(page, 'Route ideas');
  await scan(page, 'Desktop Routes');
  await go(page, 'About us');
  await scan(page, 'Desktop About us');
  await go(page, 'Our shortlist');
  await scan(page, 'Desktop Shortlist');
  await page.getByRole('button', { name: 'Share our trip', exact: true }).click();
  await scan(page, 'Desktop share dialog');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await mobileContext.newPage();
  mobile.setDefaultTimeout(15000);
  await mobile.goto(APP_URL, { waitUntil: 'networkidle' });
  await scan(mobile, 'Mobile Discover');
  await mobile.screenshot({
    path: path.join(outputDir, 'accessibility-mobile.png'),
    fullPage: false,
  });
  await go(mobile, 'About us', true);
  await scan(mobile, 'Mobile About us');
  await mobile.getByRole('button', { name: 'Share our trip', exact: true }).click();
  await scan(mobile, 'Mobile share dialog');
  fs.writeFileSync(
    path.join(outputDir, 'accessibility-results.json'),
    JSON.stringify(reports, null, 2),
  );
  const serious = reports
    .flatMap((report) => report.violations)
    .filter((v) => ['serious', 'critical'].includes(v.impact));
  const total = reports.reduce((sum, report) => sum + report.violations.length, 0);
  console.log(
    `Accessibility result: ${reports.length} views, ${total} rule violations, ${serious.length} serious/critical.`,
  );
  if (serious.length) process.exitCode = 1;
})()
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
  });

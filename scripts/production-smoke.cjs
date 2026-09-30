#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { chromium } = require('playwright');
require('node:fs').mkdirSync('.test-results', { recursive: true });
(async () => {
  const username = 'test-travellers';
  const password = randomBytes(32).toString('hex');
  const server = spawn(process.execPath, ['server.mjs'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: '0',
      APP_ORIGIN: 'http://127.0.0.1',
      PLANNER_USERNAME: username,
      PLANNER_PASSWORD: password,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Production server startup timed out')),
        10000,
      );
      server.stdout.on('data', (chunk) => {
        const match = chunk.toString().match(/Server ready on port (\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(Number(match[1]));
        }
      });
      server.once('exit', () => {
        clearTimeout(timeout);
        reject(new Error('Production server exited before readiness'));
      });
    });
    const url = `http://127.0.0.1:${port}`;
    const response = await fetch(url);
    assert.equal(response.status, 401);
    assert.equal(await response.text(), 'Authentication required.\n');
    browser = await chromium.launch({
      executablePath: process.env.BROWSER_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox'],
    });
    const context = await browser.newContext({
      httpCredentials: { username, password },
      reducedMotion: 'reduce',
      viewport: { width: 1440, height: 1080 },
    });
    const page = await context.newPage();
    const errors = [],
      violations = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.exposeFunction('recordViolation', (directive) => violations.push(directive));
    await page.addInitScript(() =>
      document.addEventListener('securitypolicyviolation', (event) =>
        window.recordViolation(event.violatedDirective),
      ),
    );
    await page.goto(url, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.experience-card').count(), 40);
    await page.locator('.japan-map__pin').first().click();
    await page.getByRole('button', { name: 'Explore this place', exact: false }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Route ideas', exact: true })
      .click();
    assert.equal(await page.locator('.day-item').count(), 14);
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Discover', exact: true })
      .click();
    await page.getByRole('textbox', { name: 'Search experiences' }).fill('Senso');
    assert.equal(await page.locator('.experience-card').count(), 1);
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await page.screenshot({ path: '.test-results/production-desktop.png', fullPage: false });
    await page.locator('.discovery').scrollIntoViewIfNeeded();
    await page.screenshot({ path: '.test-results/production-map.png', fullPage: false });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.test-results/production-mobile.png', fullPage: false });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    assert.deepEqual(violations, []);
    console.log(
      'Protected production browser check passed: 401 gate, authenticated app/assets, map details, route days, accent-insensitive search, mobile layout; no page errors or CSP violations.',
    );
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

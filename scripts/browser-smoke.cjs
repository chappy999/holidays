#!/usr/bin/env node
'use strict';

// Runs the real application in Chromium. Start Vite first, then run:
// NODE_PATH=<directory containing playwright> node scripts/browser-smoke.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:5173';
const BROWSER_PATH = process.env.BROWSER_PATH || '/usr/bin/chromium';
const STORAGE_KEY = 'japan-together:v1';
const NOTE = 'Our shared note: おいしい — Charlie & Daniella 🗾\nTea before the temple.';
const EXPERIENCE_ID = 'tokyo-asakusa-sensoji';
const CHOSEN_ROUTE = 'art-islands-and-inland-sea';
const outputDir = path.resolve('.test-results');
const errors = [];
let checks = 0;
let browser;

function check(condition, message) {
  assert.ok(condition, message);
  checks++;
}

function equal(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  checks++;
}

async function trackPage(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(error.message));
  return page;
}

async function waitForCards(page, count) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('.experience-card').length === expected,
    count,
  );
  equal(
    await page.locator('.experience-card').count(),
    count,
    `Expected ${count} experience cards`,
  );
}

async function go(page, name, mobile = false) {
  if (mobile) await page.getByRole('button', { name: 'Toggle menu', exact: true }).click();
  // The shortlist button's accessible name also includes its live count badge.
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: new RegExp(`^${name}(?:\\s*\\d+)?$`) })
    .click();
}

async function stateFrom(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
}

async function openAsakusa(page) {
  await page.locator('.card-title').filter({ hasText: 'Old Tokyo, a little slower' }).click();
  await page
    .getByRole('dialog', { name: 'Sensō-ji and the backstreets of Asakusa', exact: true })
    .waitFor();
  return page.getByRole('dialog');
}

async function noHorizontalOverflow(page, label) {
  const dims = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  check(
    dims.document <= dims.viewport + 1,
    `${label}: document width ${dims.document} exceeds viewport ${dims.viewport}`,
  );
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  browser = await chromium.launch({
    executablePath: BROWSER_PATH,
    headless: true,
    args: ['--no-sandbox'],
  });
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await trackPage(desktopContext);
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await waitForCards(page, 40);
  await noHorizontalOverflow(page, 'Desktop discover');
  await page.screenshot({ path: path.join(outputDir, 'desktop-discover.png'), fullPage: false });

  await page.getByRole('textbox', { name: 'Search experiences' }).fill('Kiso');
  await page.waitForFunction(() => document.querySelectorAll('.experience-card').length < 40);
  const searchCards = await page.locator('.experience-card').count();
  check(searchCards > 0 && searchCards < 40, 'Kiso search should return a nonempty restricted set');
  check(
    (await page.locator('.experience-list').innerText()).includes('Magome'),
    'Kiso search should include the Nakasendō experience',
  );
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await waitForCards(page, 40);
  await page
    .locator('.tier-filters')
    .getByRole('button', { name: 'A little quieter', exact: true })
    .click();
  await page.waitForFunction(() => document.querySelectorAll('.experience-card').length < 40);
  const quietCount = await page.locator('.experience-card').count();
  check(quietCount > 0 && quietCount < 40, 'Quiet filter should restrict the collection');
  equal(
    await page.locator('.experience-card .tier-quiet').count(),
    quietCount,
    'Every quiet-filter result has the quiet tier',
  );
  await page.getByRole('button', { name: 'More filters', exact: true }).click();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await waitForCards(page, 40);
  console.log(
    `Search and filtering passed (${searchCards} Kiso matches; ${quietCount} quiet options).`,
  );

  let dialog = await openAsakusa(page);
  for (const person of ['Charlie', 'Daniella']) {
    const love = dialog
      .locator('.vote-row')
      .filter({ hasText: person })
      .getByRole('button', { name: 'Love it', exact: true });
    await love.click();
    equal(await love.getAttribute('aria-pressed'), 'true', `${person}'s love vote is selected`);
  }
  const note = dialog.getByRole('textbox', { name: 'A note for each other' });
  await note.click();
  await note.pressSequentially('Our shared note: ', { delay: 12 });
  check(
    await note.evaluate((element) => document.activeElement === element),
    'Typing into a detail note must preserve input focus through renders',
  );
  await page.keyboard.insertText('おいしい — Charlie & Daniella 🗾');
  await note.press('Enter');
  await page.keyboard.insertText('Tea before the temple.');
  equal(await note.inputValue(), NOTE, 'Detail note accepts Unicode, punctuation and a newline');
  check(
    await note.evaluate((element) => document.activeElement === element),
    'Unicode note editing retains focus',
  );
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();

  await go(page, 'Our shortlist');
  equal(
    await page.locator('.shortlist-summary > div').nth(0).locator('strong').innerText(),
    '1',
    'Shortlist contains one experience',
  );
  equal(
    await page.locator('.shortlist-summary > div').nth(1).locator('strong').innerText(),
    '1',
    'Both-love count is one',
  );
  await page.getByRole('button', { name: 'We both love it', exact: true }).click();
  await waitForCards(page, 1);
  await page.reload({ waitUntil: 'networkidle' });
  await go(page, 'Our shortlist');
  await waitForCards(page, 1);
  dialog = await openAsakusa(page);
  equal(
    await dialog.getByRole('textbox', { name: 'A note for each other' }).inputValue(),
    NOTE,
    'Detail note persists after reload',
  );
  equal(await dialog.locator('.vote-button.chosen').count(), 2, 'Both votes persist after reload');
  await page.keyboard.press('Escape');
  equal(await page.getByRole('dialog').count(), 0, 'Escape dismisses the modal');

  await go(page, 'About us');
  const artInterest = page
    .locator('.traveller-card')
    .first()
    .getByRole('button', { name: 'Art & design', exact: true });
  equal(
    await artInterest.getAttribute('aria-pressed'),
    'false',
    'Art is initially unselected for Charlie',
  );
  await artInterest.click();
  equal(await artInterest.getAttribute('aria-pressed'), 'true', 'Profile interest is editable');
  await page.waitForFunction(
    (key) =>
      JSON.parse(localStorage.getItem(key)).profile.travellers[0].interests.includes(
        'Art & design',
      ),
    STORAGE_KEY,
  );
  check(
    (await stateFrom(page)).profile.travellers[0].interests.includes('Art & design'),
    'Changed interest persists in saved state',
  );

  await go(page, 'Route ideas');
  equal(await page.locator('.route-card').count(), 3, 'Three route ideas are available');
  await page.locator('.route-card').filter({ hasText: 'Art, islands and the Inland Sea' }).click();
  await page.getByRole('button', { name: 'Make this our starting point', exact: true }).click();
  equal(await page.locator('.day-item').count(), 14, 'The selected route includes fourteen days');
  equal((await stateFrom(page)).chosenRoute, CHOSEN_ROUTE, 'The chosen route is saved');
  await page.screenshot({ path: path.join(outputDir, 'desktop-route.png'), fullPage: false });

  await page.getByRole('button', { name: 'Share our trip', exact: true }).click();
  const shareLink = await page
    .getByRole('textbox', { name: 'Your share link', exact: true })
    .inputValue();
  check(
    shareLink.startsWith(`${new URL(APP_URL).origin}/#plan=`),
    'Share link uses the app origin and a plan fragment',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click();

  const importedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const imported = await trackPage(importedContext);
  await imported.goto(shareLink, { waitUntil: 'networkidle' });
  await imported.getByRole('dialog', { name: 'Open a shared Japan plan', exact: true }).waitFor();
  equal(
    (await stateFrom(imported)).chosenRoute,
    null,
    'Opening a link does not overwrite state before the import action',
  );
  await imported.getByRole('button', { name: 'Open shared plan', exact: true }).click();
  await imported.waitForFunction(
    (key) => JSON.parse(localStorage.getItem(key)).chosenRoute === 'art-islands-and-inland-sea',
    STORAGE_KEY,
  );
  const importedState = await stateFrom(imported);
  equal(importedState.chosenRoute, CHOSEN_ROUTE, 'Shared snapshot restores the chosen route');
  equal(
    importedState.notes[EXPERIENCE_ID],
    NOTE,
    'Shared snapshot preserves the complete Unicode note',
  );
  equal(
    importedState.votes[EXPERIENCE_ID],
    ['love', 'love'],
    'Shared snapshot restores both votes',
  );
  check(
    importedState.profile.travellers[0].interests.includes('Art & design'),
    'Shared snapshot restores profile changes',
  );
  equal(new URL(imported.url()).hash, '', 'Successful import clears the shared fragment');
  await go(imported, 'Our shortlist');
  await waitForCards(imported, 1);
  equal(
    await imported.locator('.shortlist-summary > div').nth(1).locator('strong').innerText(),
    '1',
    'Imported shortlist shows both travellers love the experience',
  );

  const malformedContext = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const malformed = await trackPage(malformedContext);
  await malformed.goto(`${APP_URL}/#plan=not-a-valid-plan`, { waitUntil: 'networkidle' });
  await malformed.getByRole('status').waitFor();
  check(
    (await malformed.getByRole('status').innerText()).includes('incomplete or invalid'),
    'Malformed snapshot produces an understandable status message',
  );
  equal(
    await malformed.getByRole('dialog').count(),
    0,
    'Malformed data does not open an import dialog',
  );
  await waitForCards(malformed, 40);
  console.log('Votes, note focus, persistence, profile, routes and snapshot sharing passed.');

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobile = await trackPage(mobileContext);
  await mobile.goto(APP_URL, { waitUntil: 'networkidle' });
  await waitForCards(mobile, 40);
  await noHorizontalOverflow(mobile, 'Mobile discover');
  await mobile.screenshot({ path: path.join(outputDir, 'mobile-discover.png'), fullPage: false });
  await mobile.getByRole('button', { name: 'Toggle menu', exact: true }).click();
  equal(
    await mobile
      .getByRole('button', { name: 'Toggle menu', exact: true })
      .getAttribute('aria-expanded'),
    'true',
    'Mobile menu opens accessibly',
  );
  await mobile
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'About us', exact: true })
    .click();
  equal(
    await mobile.getByRole('textbox', { name: 'Traveller 1 name', exact: true }).inputValue(),
    'Charlie',
    'Mobile profile is accessible from the menu',
  );
  equal(
    await mobile
      .getByRole('button', { name: 'Toggle menu', exact: true })
      .getAttribute('aria-expanded'),
    'false',
    'Mobile menu closes after navigation',
  );
  await noHorizontalOverflow(mobile, 'Mobile profile');
  await mobile
    .locator('.traveller-card')
    .first()
    .getByRole('button', { name: 'Gardens', exact: true })
    .click();
  equal(
    await mobile
      .locator('.traveller-card')
      .first()
      .getByRole('button', { name: 'Gardens', exact: true })
      .getAttribute('aria-pressed'),
    'true',
    'Mobile interest editing works',
  );
  await go(mobile, 'Discover', true);
  const mobileDialog = await openAsakusa(mobile);
  await noHorizontalOverflow(mobile, 'Mobile detail modal');
  const modalBox = await mobileDialog.boundingBox();
  check(
    modalBox && modalBox.x >= -1 && modalBox.x + modalBox.width <= 391,
    'Mobile detail modal fits the viewport',
  );
  await mobileDialog
    .locator('.vote-row')
    .first()
    .getByRole('button', { name: 'Love it', exact: true })
    .click();
  equal(
    await mobileDialog
      .locator('.vote-row')
      .first()
      .getByRole('button', { name: 'Love it', exact: true })
      .getAttribute('aria-pressed'),
    'true',
    'Mobile modal supports voting',
  );
  await mobile.screenshot({ path: path.join(outputDir, 'mobile-detail.png'), fullPage: false });
  await mobileDialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  equal(await mobile.getByRole('dialog').count(), 0, 'Mobile modal closes');
  equal(errors, [], 'No browser page errors across desktop, imports and mobile');
  console.log(`PASS: ${checks} browser checks. Screenshots saved in ${outputDir}.`);
})()
  .catch((error) => {
    console.error(`FAIL after ${checks} checks: ${error.stack || error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
  });

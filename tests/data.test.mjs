import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readData = async (name) =>
  JSON.parse(await readFile(new URL(`../research/${name}.json`, import.meta.url), 'utf8'));
const [classics, quiet, routes] = await Promise.all(['classics', 'quiet', 'routes'].map(readData));
const experiences = [...classics, ...quiet];
const allRecords = [...experiences, ...routes];
const expectedDates = Array.from(
  { length: 14 },
  (_, i) => `2026-11-${String(i + 2).padStart(2, '0')}`,
);
const nonempty = (value, context) =>
  assert.ok(typeof value === 'string' && value.trim().length > 0, context);

test('saved decisions have a unique stable identifier for every experience and route', () => {
  assert.ok(experiences.length > 0 && routes.length > 0);
  const ids = allRecords.map((record) => record.id);
  assert.equal(
    new Set(ids).size,
    ids.length,
    'duplicate IDs would mix up votes or selected routes',
  );
  for (const id of ids)
    assert.match(id, /^[a-z0-9-]{1,100}$/, 'IDs must survive share-plan validation');
});

test('every mapped experience and accommodation has finite coordinates within Japan’s broad extent', () => {
  for (const location of [...experiences, ...routes.flatMap((route) => route.stops)]) {
    const label = location.id ?? location.name;
    assert.ok(
      Number.isFinite(location.lat) && location.lat >= 20 && location.lat <= 46,
      `${label}: latitude`,
    );
    assert.ok(
      Number.isFinite(location.lng) && location.lng >= 122 && location.lng <= 154,
      `${label}: longitude`,
    );
  }
});

test('each option carries useful decision context and an HTTPS source with explicit verification status', () => {
  for (const experience of experiences) {
    for (const field of [
      'title',
      'region',
      'duration',
      'description',
      'whyGo',
      'tradeoff',
      'novemberNote',
      'bookingNote',
      'sourceLabel',
    ]) {
      nonempty(experience[field], `${experience.id}: ${field}`);
    }
    assert.ok(
      ['food', 'culture', 'nature', 'art', 'neighbourhood', 'onsen'].includes(experience.category),
      experience.id,
    );
    assert.ok(['classic', 'quiet', 'detour'].includes(experience.tier), experience.id);
    assert.ok(['easy', 'moderate', 'active'].includes(experience.walking), experience.id);
    assert.ok(['pending', 'verified'].includes(experience.verification), experience.id);
    const source = new URL(experience.sourceUrl);
    assert.equal(source.protocol, 'https:', `${experience.id}: source must use HTTPS`);
    assert.equal(source.username + source.password, '', 'source links must not embed credentials');
    assert.ok(source.hostname.includes('.') && source.hostname !== 'localhost', experience.id);
    assert.ok(Array.isArray(experience.tags) && experience.tags.length > 0, experience.id);
    for (const tag of experience.tags) nonempty(tag, experience.id);
  }
});

for (const route of routes) {
  test(`${route.title}: 13 nights line up with all 14 trip dates and the nightly bases`, () => {
    assert.equal(route.nights, 13);
    assert.deepEqual(
      route.days.map((day) => day.date),
      expectedDates,
      'no missing, duplicated or out-of-order trip dates',
    );
    assert.equal(
      route.stops.reduce((sum, stop) => sum + stop.nights, 0),
      13,
    );

    const nightlyBases = [];
    let nextDay = 2;
    for (const stop of route.stops) {
      assert.ok(Number.isInteger(stop.nights) && stop.nights > 0, stop.name);
      assert.equal(
        stop.dates,
        `${nextDay}–${nextDay + stop.nights} Nov`,
        `${stop.name}: displayed stay dates must match its nights`,
      );
      nextDay += stop.nights;
      nightlyBases.push(...Array(stop.nights).fill(stop.name));
      nonempty(stop.description, stop.name);
    }
    assert.equal(nextDay, 15);
    assert.deepEqual(
      route.days.slice(0, -1).map((day) => day.base),
      nightlyBases,
      'daily plans must use the accommodation booked for that night',
    );
    assert.ok(['Tokyo', 'Osaka'].includes(route.departure));
    assert.equal(route.stops[0].name, 'Tokyo', 'arrival is in Tokyo');
    assert.equal(
      route.stops.at(-1).name,
      route.departure,
      'final accommodation must support the advertised departure city',
    );
    assert.ok(route.days.at(-1).base.startsWith(route.departure));
    for (const day of route.days) {
      nonempty(day.title, `${route.id}: ${day.date} title`);
      nonempty(day.detail, `${route.id}: ${day.date} detail`);
    }
  });

  test(`${route.title}: every hotel move has a matching transfer and practical timing`, () => {
    assert.equal(route.hotelChanges, route.stops.length - 1);
    assert.equal(route.transfers.length, route.hotelChanges);
    for (let i = 0; i < route.transfers.length; i++) {
      const transfer = route.transfers[i];
      assert.equal(transfer.from, route.stops[i].name);
      assert.equal(transfer.to, route.stops[i + 1].name);
      nonempty(transfer.duration, `${route.id}: transfer duration`);
      nonempty(transfer.note, `${route.id}: transfer practicalities`);
    }
    nonempty(route.tradeoff, `${route.id}: honest compromise`);
    assert.match(route.color, /^#[\da-f]{6}$/i);
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodePlan,
  encodePlan,
  fitReasons,
  freshState,
  getDecision,
  validateState,
} from '../src/state.ts';

const rawLink = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

test('a shared plan preserves both travellers, Unicode notes, votes and the selected route', () => {
  const plan = freshState();
  plan.profile.travellers[0].name = 'Charlie 東京';
  plan.profile.travellers[1].name = 'Daniella — 京都 🌸';
  plan.profile.travellers[0].notes = 'Soba, café stops and 旧街道 walks.';
  plan.profile.travellers[1].interests = ['Food & drink', 'Art & design'];
  plan.profile.budget = '£100–£150 per room / night';
  plan.votes['kiso-nakasendo'] = ['love', 'love'];
  plan.votes['naoshima-art-island'] = ['love', 'pass'];
  plan.votes['tokyo-asakusa-sensoji'] = [null, 'maybe'];
  plan.notes['kiso-nakasendo'] = 'Two nights, please.\n日本の秋 🍁 — pack a small bag.';
  plan.chosenRoute = 'post-towns-and-forest-paths';

  const encoded = encodePlan(plan);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/, 'the fragment should be safe in a copied URL');
  assert.deepEqual(decodePlan(encoded), plan);
});

test('new plans do not share mutable traveller preferences or decision records', () => {
  const first = freshState();
  const original = freshState();
  first.profile.travellers[0].name = 'Changed';
  first.profile.travellers[0].interests.push('Art & design');
  first.profile.travellers[1].notes = 'Only in this plan';
  first.votes['kiso-nakasendo'] = ['pass', 'pass'];
  first.notes['kiso-nakasendo'] = 'Changed';
  assert.deepEqual(freshState(), original);
});

test('broken or unsupported links fail clearly rather than silently losing decisions', () => {
  const good = encodePlan(freshState());
  for (const broken of [
    '',
    '%not-base64%',
    'bnVsbA',
    good.slice(0, -8),
    rawLink({ version: 2 }),
    rawLink({ votes: {} }),
  ]) {
    assert.throws(() => decodePlan(broken), /invalid|incomplete|supported/i);
  }
  for (const unsupported of [
    null,
    [],
    false,
    'a plan',
    {},
    { version: 0 },
    { version: '1' },
    { version: 2 },
  ]) {
    assert.throws(() => validateState(unsupported), /supported/i);
  }
});

test('oversized incoming links are rejected before parsing', () => {
  assert.throws(() => decodePlan('a'.repeat(80_001)), /too large/i);
});

test('an oversized notebook cannot create a share link that the app refuses to open', () => {
  const plan = freshState();
  for (let i = 0; i < 40; i++) plan.notes[`experience-${i}`] = 'A'.repeat(2000);
  assert.throws(() => encodePlan(plan), /too large/i);
});

test('import sanitization preserves valid decisions while dropping malformed vote records', () => {
  const clean = validateState({
    version: 1,
    chosenRoute: 42,
    votes: {
      'kiso-nakasendo': ['love', 'maybe'],
      'tokyo-asakusa-sensoji': [null, 'pass'],
      'bad-value': ['love', 'yes'],
      'one-traveller': ['love'],
      'three-travellers': ['love', 'pass', null],
      'not-an-array': { 0: 'love', 1: 'pass' },
      'unsafe/id': ['love', 'love'],
    },
    notes: { 'kiso-nakasendo': 'Keep this thought', 'bad-value': 123, 'unsafe/id': 'Discard' },
  });
  assert.deepEqual(clean.votes, {
    'kiso-nakasendo': ['love', 'maybe'],
    'tokyo-asakusa-sensoji': [null, 'pass'],
  });
  assert.deepEqual(clean.notes, { 'kiso-nakasendo': 'Keep this thought' });
  assert.equal(clean.chosenRoute, null);
});

test('imported prototype keys cannot change application or global object prototypes', () => {
  const raw = JSON.parse(
    '{"version":1,"__proto__":{"polluted":true},"votes":{"__proto__":["love","love"],"kiso-nakasendo":["love","pass"]},"notes":{"__proto__":"polluted","kiso-nakasendo":"Safe note"}}',
  );
  const clean = validateState(raw);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf(clean), Object.prototype);
  assert.equal(Object.getPrototypeOf(clean.votes), Object.prototype);
  assert.equal(Object.getPrototypeOf(clean.notes), Object.prototype);
  assert.equal(Object.hasOwn(clean.votes, '__proto__'), false);
  assert.equal(Object.hasOwn(clean.notes, '__proto__'), false);
  assert.deepEqual(clean.votes['kiso-nakasendo'], ['love', 'pass']);
  assert.equal(clean.notes['kiso-nakasendo'], 'Safe note');
});

test('partial or malformed profiles retain usable names and the other traveller’s preferences', () => {
  const defaults = freshState();
  const clean = validateState({
    version: 1,
    profile: {
      budget: { amount: 150 },
      pace: 'A slower week',
      travellers: [
        { name: '   ', interests: ['Food & drink', 'Unrecognised', 4], walking: false },
        null,
        { name: 'Third person' },
      ],
    },
  });
  assert.equal(clean.profile.budget, defaults.profile.budget);
  assert.equal(clean.profile.pace, 'A slower week');
  assert.equal(clean.profile.travellers.length, 2);
  assert.equal(clean.profile.travellers[0].name, 'Charlie');
  assert.equal(clean.profile.travellers[0].walking, defaults.profile.travellers[0].walking);
  assert.deepEqual(clean.profile.travellers[0].interests, ['Food & drink']);
  assert.deepEqual(clean.profile.travellers[1], defaults.profile.travellers[1]);
});

test('untrusted oversized text is bounded without removing unrelated valid decisions', () => {
  const clean = validateState({
    version: 1,
    profile: { travellers: [{ name: 'N'.repeat(500), notes: 'T'.repeat(9000) }] },
    notes: { 'kiso-nakasendo': 'X'.repeat(9000) },
    votes: { 'kiso-nakasendo': ['love', 'love'] },
  });
  assert.ok(clean.profile.travellers[0].name.length <= 50);
  assert.ok(clean.profile.travellers[0].notes.length <= 2000);
  assert.ok(clean.notes['kiso-nakasendo'].length <= 2000);
  assert.equal(getDecision(clean.votes['kiso-nakasendo']), 'both');
});

test('couple decisions distinguish consensus, one-person enthusiasm, conflict and passes', () => {
  const cases = [
    [undefined, 'unseen'],
    [[null, null], 'unseen'],
    [['love', 'love'], 'both'],
    [['love', null], 'one'],
    [['love', 'maybe'], 'one'],
    [['love', 'pass'], 'discuss'],
    [['maybe', 'maybe'], 'discuss'],
    [['maybe', null], 'discuss'],
    [['maybe', 'pass'], 'discuss'],
    [['pass', null], 'discuss'],
    [['pass', 'pass'], 'passed'],
  ];
  for (const [votes, decision] of cases) {
    assert.equal(getDecision(votes), decision, JSON.stringify(votes));
    if (votes)
      assert.equal(
        getDecision([...votes].reverse()),
        decision,
        'swapping travellers must not change the result',
      );
  }
});

test('fit explanations respond to either traveller’s interests without inventing a match', () => {
  const profile = freshState().profile;
  const art = { category: 'art', tier: 'classic' };
  assert.deepEqual(fitReasons(art, profile), []);
  profile.travellers[1].interests = ['Art & design'];
  assert.deepEqual(fitReasons(art, profile), ['An art & design favourite']);
  profile.travellers[0].interests = [];
  profile.travellers[1].interests = [];
  assert.deepEqual(fitReasons({ category: 'nature', tier: 'quiet' }, profile), []);
});

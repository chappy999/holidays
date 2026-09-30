import type { Experience, Profile, TripState, Vote } from './types';
export const STORAGE_KEY = 'japan-together:v1';
export const INTERESTS = [
  'Food & drink',
  'Outdoors & hiking',
  'Culture & history',
  'Unusual experiences',
  'Art & design',
  'Gardens',
  'Ryokan & onsen',
  'Neighbourhoods',
  'Shopping',
  'Nightlife',
  'Anime & gaming',
];
export const initialProfile: Profile = {
  travellers: [
    {
      name: 'Charlie',
      interests: INTERESTS.slice(0, 4),
      beenBefore: 'Not specified',
      walking: 'Active — full days on foot',
      notes: '',
    },
    {
      name: 'Daniella',
      interests: INTERESTS.slice(0, 4),
      beenBefore: 'Not specified',
      walking: 'Active — full days on foot',
      notes: '',
    },
  ],
  pace: 'Full days, fewer transfers',
  budget: '£100–£150 per room / night',
  hotelMoves: 'Only when the destination earns it',
  departure: 'Compare Tokyo & Osaka',
  constraints: 'No constraints reported',
  splurge: 'A special meal, ryokan or experience',
  driving: 'Not specified — plan around public transport',
  year: '2026',
  flights: 'Not specified',
};
export const freshState = (): TripState => ({
  version: 1,
  profile: structuredClone(initialProfile),
  votes: {},
  chosenRoute: null,
  notes: {},
});
const validVote = (v: unknown): v is Vote | null =>
  v === null || v === 'love' || v === 'maybe' || v === 'pass';
const textValue = (v: unknown, fallback: string, max = 2000) =>
  typeof v === 'string' ? v.slice(0, max) : fallback;
export function validateState(raw: unknown): TripState {
  if (!raw || typeof raw !== 'object' || (raw as { version?: unknown }).version !== 1)
    throw new Error('This does not look like a supported Japan plan.');
  const result = freshState(),
    input = raw as Record<string, unknown>;
  if (input.profile && typeof input.profile === 'object') {
    const p = input.profile as Record<string, unknown>;
    for (const key of [
      'pace',
      'budget',
      'hotelMoves',
      'departure',
      'constraints',
      'splurge',
      'driving',
      'year',
      'flights',
    ] as const)
      result.profile[key] = textValue(p[key], result.profile[key]);
    if (Array.isArray(p.travellers))
      for (let i = 0; i < 2; i++) {
        const t = p.travellers[i];
        if (!t || typeof t !== 'object') continue;
        const base = result.profile.travellers[i];
        base.name = textValue(t.name, base.name, 50).trim() || base.name;
        base.beenBefore = textValue(t.beenBefore, base.beenBefore);
        base.walking = textValue(t.walking, base.walking);
        base.notes = textValue(t.notes, '');
        if (Array.isArray(t.interests))
          base.interests = t.interests
            .filter((x: unknown) => typeof x === 'string' && INTERESTS.includes(x))
            .slice(0, INTERESTS.length);
      }
  }
  if (input.votes && typeof input.votes === 'object')
    for (const [id, v] of Object.entries(input.votes)) {
      if (/^[a-z0-9-]{1,100}$/.test(id) && Array.isArray(v) && v.length === 2 && v.every(validVote))
        result.votes[id] = v as [Vote | null, Vote | null];
    }
  if (input.notes && typeof input.notes === 'object')
    for (const [id, note] of Object.entries(input.notes))
      if (/^[a-z0-9-]{1,100}$/.test(id) && typeof note === 'string')
        result.notes[id] = note.slice(0, 2000);
  result.chosenRoute =
    typeof input.chosenRoute === 'string' ? input.chosenRoute.slice(0, 100) : null;
  return result;
}
export function readSaved(): TripState {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? validateState(JSON.parse(value)) : freshState();
  } catch {
    return freshState();
  }
}
export function encodePlan(state: TripState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  const encoded = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  if (encoded.length > 80000) throw new Error('This plan is too large to share as a link.');
  return encoded;
}
export function decodePlan(encoded: string): TripState {
  if (encoded.length > 80000) throw new Error('This shared plan is too large to open.');
  try {
    const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return validateState(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new Error('This shared link is incomplete or invalid. Ask for a fresh link.');
  }
}
export function fitReasons(e: Experience, profile: Profile): string[] {
  const likes = new Set(profile.travellers.flatMap((t) => t.interests));
  const result: string[] = [];
  if (e.category === 'food' && likes.has('Food & drink')) result.push('For your love of food');
  if (e.category === 'nature' && likes.has('Outdoors & hiking'))
    result.push('Time in the outdoors');
  if (
    (e.category === 'culture' || e.category === 'neighbourhood') &&
    likes.has('Culture & history')
  )
    result.push('A closer look at local life');
  if (e.tier === 'quiet' && likes.has('Unusual experiences')) result.push('Beyond the obvious');
  if (e.category === 'art' && likes.has('Art & design')) result.push('An art & design favourite');
  if (e.category === 'onsen' && likes.has('Ryokan & onsen')) result.push('A slower, special night');
  return result;
}
export function getDecision(
  votes: [Vote | null, Vote | null] | undefined,
): 'both' | 'one' | 'discuss' | 'passed' | 'unseen' {
  if (!votes || votes.every((v) => v === null)) return 'unseen';
  if (votes.every((v) => v === 'love')) return 'both';
  if (votes.includes('love') && votes.includes('pass')) return 'discuss';
  if (votes.includes('love')) return 'one';
  if (votes.every((v) => v === 'pass')) return 'passed';
  return 'discuss';
}

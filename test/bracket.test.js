import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knockoutRounds } from '../assets/bracket.js';

const team = (code) => (code ? { code, name: code } : { code: null, name: 'TBD' });
const ko = (id, stage, utcDate, home, away) => ({
  id, stage, group: null, utcDate, status: home && away ? 'FINISHED' : 'TIMED',
  home: team(home), away: team(away),
  homeScore: null, awayScore: null, winner: null,
});

// Real WC2026 feed ids and pairings. The Round of 16 is deliberately id'd out
// of bracket order by football-data, and the kickoff dates below are jumbled so
// a date sort would place the boxes differently again. Bracket order must win.
const fixture = [
  // Round of 16 (bracket order is 375,376,379,380,377,378,381,382)
  ko(537375, 'LAST_16', '2026-07-04T21:00:00Z', 'PAR', 'FRA'),
  ko(537376, 'LAST_16', '2026-07-04T17:00:00Z', 'CAN', 'MAR'),
  ko(537377, 'LAST_16', '2026-07-05T20:00:00Z', 'BRA', 'NOR'),
  ko(537378, 'LAST_16', '2026-07-06T00:00:00Z', 'MEX', 'ENG'),
  ko(537379, 'LAST_16', '2026-07-06T19:00:00Z', 'POR', 'ESP'),
  ko(537380, 'LAST_16', '2026-07-07T00:00:00Z', 'USA', 'BEL'),
  ko(537381, 'LAST_16', '2026-07-07T16:00:00Z', 'ARG', 'EGY'),
  ko(537382, 'LAST_16', '2026-07-07T20:00:00Z', 'SUI', 'COL'),
  // Quarter-finals: feed already numbers these in bracket order.
  ko(537383, 'QUARTER_FINALS', '2026-07-09T20:00:00Z', 'FRA', 'MAR'),
  ko(537384, 'QUARTER_FINALS', '2026-07-10T19:00:00Z', null, null),
  ko(537385, 'QUARTER_FINALS', '2026-07-11T21:00:00Z', 'NOR', 'ENG'),
  ko(537386, 'QUARTER_FINALS', '2026-07-12T01:00:00Z', null, null),
];

const round = (rounds, key) => rounds.find((r) => r.key === key);
const codes = (slot) => [slot.home?.code, slot.away?.code];

test('Round of 16 slots follow bracket order, not id or kickoff order', () => {
  const r16 = round(knockoutRounds(fixture), 'LAST_16').slots;
  assert.deepEqual(r16.map((m) => m.id),
    [537375, 537376, 537379, 537380, 537377, 537378, 537381, 537382]);
});

test('quarter-finals stay in feed id order (already bracket order)', () => {
  const qf = round(knockoutRounds(fixture), 'QUARTER_FINALS').slots;
  assert.deepEqual(qf.map((m) => m.id), [537383, 537384, 537385, 537386]);
});

test('each quarter-final box sits above the two R16 boxes that feed it', () => {
  const rounds = knockoutRounds(fixture);
  const r16 = round(rounds, 'LAST_16').slots;
  const qf = round(rounds, 'QUARTER_FINALS').slots;
  // Norway/England is QF slot 2; its feeders are R16 slots 4 and 5.
  assert.deepEqual(codes(qf[2]), ['NOR', 'ENG']);
  assert.deepEqual(codes(r16[4]), ['BRA', 'NOR']);
  assert.deepEqual(codes(r16[5]), ['MEX', 'ENG']);
  // France/Morocco is QF slot 0; its feeders are R16 slots 0 and 1.
  assert.deepEqual(codes(qf[0]), ['FRA', 'MAR']);
  assert.deepEqual(codes(r16[0]), ['PAR', 'FRA']);
  assert.deepEqual(codes(r16[1]), ['CAN', 'MAR']);
});

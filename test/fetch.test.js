import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalise } from '../scripts/fetch-scores.js';

const apiFixture = {
  matches: [
    {
      id: 9001, stage: 'GROUP_STAGE', group: 'Group A',
      utcDate: '2026-06-12T02:00:00Z', status: 'FINISHED',
      homeTeam: { tla: 'MEX', name: 'Mexico', crest: 'https://x/mex.png' },
      awayTeam: { tla: 'RSA', name: 'South Africa', crest: 'https://x/rsa.png' },
      score: { winner: 'HOME_TEAM', duration: 'REGULAR', fullTime: { home: 2, away: 0 } },
    },
    {
      id: 9002, stage: 'LAST_32', group: null,
      utcDate: '2026-06-29T00:00:00Z', status: 'TIMED',
      homeTeam: { tla: null, name: null, crest: null },
      awayTeam: { tla: null, name: null, crest: null },
      score: { winner: null, duration: 'REGULAR', fullTime: { home: null, away: null } },
    },
    {
      id: 9003, stage: 'LAST_16', group: null,
      utcDate: '2026-07-04T00:00:00Z', status: 'FINISHED',
      homeTeam: { tla: 'ARG', name: 'Argentina', crest: '' },
      awayTeam: { tla: 'NED', name: 'Netherlands', crest: '' },
      score: { winner: 'HOME_TEAM', duration: 'PENALTY_SHOOTOUT', fullTime: { home: 2, away: 2 } },
    },
  ],
};

test('normalise maps the API shape', () => {
  const out = normalise(apiFixture);
  assert.ok(out.lastUpdated);
  assert.equal(out.matches.length, 3);
  const first = out.matches[0];
  assert.equal(first.home.code, 'MEX');
  assert.equal(first.homeScore, 2);
  assert.equal(first.decidedBy, 'REGULAR');
  assert.equal(first.winner, 'HOME_TEAM');
});

test('normalise handles TBD knockout slots and shootouts', () => {
  const out = normalise(apiFixture);
  assert.equal(out.matches[1].home.code, null);
  assert.equal(out.matches[1].home.name, 'TBD');
  assert.equal(out.matches[2].decidedBy, 'PENALTIES');
});

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
      // Real v4 shape for a shootout: fullTime INCLUDES the shootout goals
      // (docs.football-data.org/general/v4/overtime.html), so the actual
      // match score is fullTime minus penalties.
      id: 9003, stage: 'LAST_16', group: null,
      utcDate: '2026-07-04T00:00:00Z', status: 'FINISHED',
      homeTeam: { tla: 'ARG', name: 'Argentina', crest: '' },
      awayTeam: { tla: 'NED', name: 'Netherlands', crest: '' },
      score: {
        winner: 'HOME_TEAM', duration: 'PENALTY_SHOOTOUT',
        fullTime: { home: 6, away: 5 },
        regularTime: { home: 2, away: 2 },
        extraTime: { home: 0, away: 0 },
        penalties: { home: 4, away: 3 },
      },
    },
    {
      // Shootout where the feed omits the penalties leg: fall back to the
      // regular + extra time legs rather than the pens-inflated fullTime.
      id: 9004, stage: 'QUARTER_FINALS', group: null,
      utcDate: '2026-07-09T00:00:00Z', status: 'FINISHED',
      homeTeam: { tla: 'FRA', name: 'France', crest: '' },
      awayTeam: { tla: 'BRA', name: 'Brazil', crest: '' },
      score: {
        winner: 'AWAY_TEAM', duration: 'PENALTY_SHOOTOUT',
        fullTime: { home: 4, away: 6 },
        regularTime: { home: 1, away: 1 },
        extraTime: { home: 0, away: 0 },
      },
    },
  ],
};

test('normalise maps the API shape', () => {
  const out = normalise(apiFixture);
  assert.ok(out.lastUpdated);
  assert.equal(out.matches.length, 4);
  const first = out.matches[0];
  assert.equal(first.home.code, 'MEX');
  assert.equal(first.homeScore, 2);
  assert.equal(first.decidedBy, 'REGULAR');
  assert.equal(first.winner, 'HOME_TEAM');
  assert.equal(first.pensHome, null);
  assert.equal(first.pensAway, null);
});

test('normalise handles TBD knockout slots and shootouts', () => {
  const out = normalise(apiFixture);
  assert.equal(out.matches[1].home.code, null);
  assert.equal(out.matches[1].home.name, 'TBD');
  assert.equal(out.matches[2].decidedBy, 'PENALTIES');
});

test('shootout match score excludes the shootout goals', () => {
  const shootout = normalise(apiFixture).matches[2];
  assert.equal(shootout.homeScore, 2); // 6 fullTime - 4 pens
  assert.equal(shootout.awayScore, 2); // 5 fullTime - 3 pens
  assert.equal(shootout.pensHome, 4);
  assert.equal(shootout.pensAway, 3);
  assert.equal(shootout.winner, 'HOME_TEAM');
});

test('shootout without a penalties leg falls back to regular + extra time', () => {
  const shootout = normalise(apiFixture).matches[3];
  assert.equal(shootout.homeScore, 1);
  assert.equal(shootout.awayScore, 1);
  assert.equal(shootout.pensHome, null);
  assert.equal(shootout.pensAway, null);
});

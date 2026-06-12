import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseName, namesMatch, extractGame, buildPredictions } from '../scripts/fetch-predictions.js';

function gameEvent({ slug, startTime, home, away, prices }) {
  return {
    slug,
    startTime,
    teams: [
      { name: home.name, abbreviation: home.abbr, ordering: 'home' },
      { name: away.name, abbreviation: away.abbr, ordering: 'away' },
    ],
    markets: [
      { slug: `${slug}-${home.abbr}`, outcomePrices: JSON.stringify([prices.home, 1 - prices.home]) },
      { slug: `${slug}-${away.abbr}`, outcomePrices: JSON.stringify([prices.away, 1 - prices.away]) },
      { slug: `${slug}-draw`, outcomePrices: JSON.stringify([prices.draw, 1 - prices.draw]) },
    ],
  };
}

const braMar = gameEvent({
  slug: 'fifwc-bra-mar-2026-06-13',
  startTime: '2026-06-13T22:00:00Z',
  home: { name: 'Brazil', abbr: 'bra' },
  away: { name: 'Morocco', abbr: 'mar' },
  prices: { home: 0.595, draw: 0.245, away: 0.165 },
});

test('normaliseName strips diacritics, punctuation and "and"', () => {
  assert.equal(normaliseName('Bosnia and Herzegovina'), 'bosniaherzegovina');
  assert.equal(normaliseName('Bosnia-Herzegovina'), 'bosniaherzegovina');
  assert.equal(normaliseName("Côte d'Ivoire"), 'cotedivoire');
  assert.equal(normaliseName('Curaçao'), 'curacao');
});

test('namesMatch covers feed-vs-Polymarket naming differences', () => {
  assert.ok(namesMatch('South Korea', 'Korea Republic'));
  assert.ok(namesMatch('Ivory Coast', "Côte d'Ivoire"));
  assert.ok(namesMatch('Turkey', 'Türkiye'));
  assert.ok(namesMatch('Cape Verde Islands', 'Cabo Verde'));
  assert.ok(!namesMatch('South Korea', 'Curaçao'));
});

test('extractGame reads the 3-way moneyline and normalises to 1', () => {
  const game = extractGame(braMar);
  assert.ok(game);
  const sum = game.home + game.draw + game.away;
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(game.home > game.draw && game.draw > game.away);
});

test('extractGame ignores prop sub-events', () => {
  assert.equal(extractGame({ ...braMar, slug: 'fifwc-bra-mar-2026-06-13-player-props' }), null);
});

test('buildPredictions keys by match id for upcoming matches only', () => {
  const matches = [
    {
      id: 1, status: 'TIMED', utcDate: '2026-06-13T22:00:00Z',
      home: { code: 'BRA', name: 'Brazil' }, away: { code: 'MAR', name: 'Morocco' },
    },
    {
      id: 2, status: 'FINISHED', utcDate: '2026-06-11T19:00:00Z',
      home: { code: 'MEX', name: 'Mexico' }, away: { code: 'RSA', name: 'South Africa' },
    },
    {
      id: 3, status: 'TIMED', utcDate: '2026-06-29T00:00:00Z',
      home: { code: null, name: 'TBD' }, away: { code: null, name: 'TBD' },
    },
  ];
  const { predictions, unmatched } = buildPredictions(matches, [braMar]);
  assert.deepEqual(Object.keys(predictions), ['1']);
  assert.equal(predictions[1].slug, 'fifwc-bra-mar-2026-06-13');
  assert.equal(predictions[1].home, 0.592);
  assert.equal(unmatched.length, 0);
});

test('buildPredictions matches the Korea naming trap by kickoff + alias', () => {
  const korCze = gameEvent({
    slug: 'fifwc-kr-cze-2026-06-11',
    startTime: '2026-06-12T02:00:00Z',
    home: { name: 'Korea Republic', abbr: 'kr' },
    away: { name: 'Czechia', abbr: 'cze' },
    prices: { home: 0.3, draw: 0.3, away: 0.4 },
  });
  const matches = [{
    id: 7, status: 'TIMED', utcDate: '2026-06-12T02:00:00Z',
    home: { code: 'KOR', name: 'South Korea' }, away: { code: 'CZE', name: 'Czechia' },
  }];
  const { predictions } = buildPredictions(matches, [korCze]);
  assert.ok(predictions[7]);
});

test('simultaneous kickoffs require both team names to agree', () => {
  const a = gameEvent({
    slug: 'fifwc-esp-nor-2026-06-24',
    startTime: '2026-06-24T20:00:00Z',
    home: { name: 'Spain', abbr: 'esp' },
    away: { name: 'Norway', abbr: 'nor' },
    prices: { home: 0.6, draw: 0.25, away: 0.15 },
  });
  const b = gameEvent({
    slug: 'fifwc-fra-sen-2026-06-24',
    startTime: '2026-06-24T20:00:00Z',
    home: { name: 'France', abbr: 'fra' },
    away: { name: 'Senegal', abbr: 'sen' },
    prices: { home: 0.5, draw: 0.3, away: 0.2 },
  });
  const matches = [
    {
      id: 11, status: 'TIMED', utcDate: '2026-06-24T20:00:00Z',
      home: { code: 'ESP', name: 'Spain' }, away: { code: 'NOR', name: 'Norway' },
    },
    {
      id: 12, status: 'TIMED', utcDate: '2026-06-24T20:00:00Z',
      home: { code: 'FRA', name: 'France' }, away: { code: 'SEN', name: 'Senegal' },
    },
  ];
  const { predictions } = buildPredictions(matches, [a, b]);
  assert.equal(predictions[11].slug, 'fifwc-esp-nor-2026-06-24');
  assert.equal(predictions[12].slug, 'fifwc-fra-sen-2026-06-24');
});

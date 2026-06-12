import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTeamTable, computeLeaderboard, teamMatches, matchPoints } from '../assets/score.js';

const T = (code, name) => ({ code, name, crest: '' });
const m = (over) => ({
  id: 1, stage: 'GROUP_STAGE', group: 'Group A', utcDate: '2026-06-12T00:00:00Z',
  status: 'FINISHED', home: T('AAA', 'Alpha'), away: T('BBB', 'Beta'),
  homeScore: 0, awayScore: 0, decidedBy: 'REGULAR', winner: 'DRAW', ...over,
});

test('win gives 3 points, loss 0, goals tracked', () => {
  const table = computeTeamTable([m({ homeScore: 2, awayScore: 1, winner: 'HOME_TEAM' })]);
  const a = table.get('AAA'), b = table.get('BBB');
  assert.equal(a.points, 3); assert.equal(a.won, 1); assert.equal(a.gd, 1);
  assert.equal(b.points, 0); assert.equal(b.lost, 1); assert.equal(b.gf, 1);
});

test('draw gives 1 point each', () => {
  const table = computeTeamTable([m({ homeScore: 1, awayScore: 1 })]);
  assert.equal(table.get('AAA').points, 1);
  assert.equal(table.get('BBB').points, 1);
});

test('penalty shootout counts as a draw for points', () => {
  const table = computeTeamTable([m({
    stage: 'LAST_16', group: null, homeScore: 1, awayScore: 1,
    decidedBy: 'PENALTIES', winner: 'AWAY_TEAM',
  })]);
  assert.equal(table.get('AAA').points, 1);
  assert.equal(table.get('BBB').points, 1);
});

test('unfinished matches register teams but score nothing', () => {
  const table = computeTeamTable([m({ status: 'TIMED', homeScore: null, awayScore: null })]);
  assert.equal(table.get('AAA').played, 0);
  assert.equal(table.get('AAA').points, 0);
});

test('knockout loser is eliminated at that stage, shootout loser too', () => {
  const table = computeTeamTable([
    m({ stage: 'LAST_32', group: null, homeScore: 1, awayScore: 1, decidedBy: 'PENALTIES', winner: 'AWAY_TEAM' }),
  ]);
  assert.equal(table.get('AAA').exitStage, 'LAST_32');
  assert.equal(table.get('BBB').exitStage, null);
});

test('final winner flagged champion', () => {
  const table = computeTeamTable([
    m({ stage: 'FINAL', group: null, homeScore: 2, awayScore: 0, winner: 'HOME_TEAM' }),
  ]);
  assert.equal(table.get('AAA').champion, true);
  assert.equal(table.get('BBB').exitStage, 'FINAL');
});

test('teams missing from knockout are out at groups once groups finish and bracket exists', () => {
  const table = computeTeamTable([
    m({ homeScore: 1, awayScore: 0, winner: 'HOME_TEAM' }),
    m({ id: 2, home: T('CCC', 'Gamma'), away: T('DDD', 'Delta'), homeScore: 0, awayScore: 2, winner: 'AWAY_TEAM' }),
    m({ id: 3, stage: 'LAST_32', group: null, status: 'TIMED', home: T('AAA', 'Alpha'), away: T('DDD', 'Delta'), homeScore: null, awayScore: null, winner: null }),
  ]);
  assert.equal(table.get('BBB').exitStage, 'GROUP_STAGE');
  assert.equal(table.get('CCC').exitStage, 'GROUP_STAGE');
  assert.equal(table.get('AAA').exitStage, null);
});

test('leaderboard sums two teams and sorts by points, gd, gf', () => {
  const table = computeTeamTable([
    m({ homeScore: 3, awayScore: 0, winner: 'HOME_TEAM' }),
    m({ id: 2, home: T('CCC', 'Gamma'), away: T('DDD', 'Delta'), homeScore: 1, awayScore: 0, winner: 'HOME_TEAM' }),
  ]);
  const board = computeLeaderboard(
    [
      { name: 'Zoe', teams: ['CCC', 'BBB'] },
      { name: 'Amy', teams: ['AAA', 'DDD'] },
    ],
    table
  );
  assert.equal(board[0].name, 'Amy');
  assert.equal(board[0].points, 3);
  assert.equal(board[0].gd, 2);
  assert.equal(board[1].points, 3);
  assert.equal(board[1].gd, -2);
});

test('exact ties are flagged', () => {
  const table = computeTeamTable([m({ homeScore: 1, awayScore: 1 })]);
  const board = computeLeaderboard(
    [
      { name: 'Amy', teams: ['AAA'] },
      { name: 'Zoe', teams: ['BBB'] },
    ],
    table
  );
  assert.equal(board[0].tied, true);
  assert.equal(board[1].tied, true);
});

test('unknown roster code scores zero and is flagged', () => {
  const board = computeLeaderboard([{ name: 'Amy', teams: ['XXX'] }], new Map());
  assert.equal(board[0].points, 0);
  assert.equal(board[0].teams[0].unknown, true);
});

test('teamMatches returns the team history in date order with outcomes', () => {
  const fixtures = [
    m({ id: 2, utcDate: '2026-06-18T00:00:00Z', home: T('CCC', 'Gamma'), away: T('AAA', 'Alpha'), homeScore: 0, awayScore: 2, winner: 'AWAY_TEAM' }),
    m({ id: 1, utcDate: '2026-06-12T00:00:00Z', homeScore: 1, awayScore: 1 }),
    m({ id: 3, utcDate: '2026-06-24T00:00:00Z', status: 'TIMED', home: T('AAA', 'Alpha'), away: T('DDD', 'Delta'), homeScore: null, awayScore: null, winner: null }),
    m({ id: 4, utcDate: '2026-06-20T00:00:00Z', home: T('CCC', 'Gamma'), away: T('DDD', 'Delta'), homeScore: 1, awayScore: 0, winner: 'HOME_TEAM' }),
  ];
  const history = teamMatches(fixtures, 'AAA');
  assert.deepEqual(history.map((h) => h.match.id), [1, 2, 3]);
  assert.deepEqual(history.map((h) => h.outcome), ['D', 'W', null]);
});

test('teamMatches marks shootouts as draws with the progression note', () => {
  const history = teamMatches([
    m({ stage: 'LAST_16', group: null, homeScore: 2, awayScore: 2, decidedBy: 'PENALTIES', winner: 'HOME_TEAM' }),
  ], 'BBB');
  assert.equal(history[0].outcome, 'D');
  assert.equal(history[0].pensProgressed, false);
  const winnerSide = teamMatches([
    m({ stage: 'LAST_16', group: null, homeScore: 2, awayScore: 2, decidedBy: 'PENALTIES', winner: 'HOME_TEAM' }),
  ], 'AAA');
  assert.equal(winnerSide[0].pensProgressed, true);
});

test('matchPoints awards 3/0 for wins, 1/1 for draws and shootouts, null unfinished', () => {
  assert.deepEqual(matchPoints(m({ homeScore: 2, awayScore: 0, winner: 'HOME_TEAM' })), { home: 3, away: 0 });
  assert.deepEqual(matchPoints(m({ homeScore: 0, awayScore: 1, winner: 'AWAY_TEAM' })), { home: 0, away: 3 });
  assert.deepEqual(matchPoints(m({ homeScore: 1, awayScore: 1 })), { home: 1, away: 1 });
  assert.deepEqual(matchPoints(m({ stage: 'FINAL', homeScore: 2, awayScore: 2, decidedBy: 'PENALTIES', winner: 'HOME_TEAM' })), { home: 1, away: 1 });
  assert.equal(matchPoints(m({ status: 'TIMED', homeScore: null, awayScore: null })), null);
});

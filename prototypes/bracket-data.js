// Shared data layer for the bracket prototypes.
// Reuses the live feed (../data) and the scoring rules in ../assets/score.js.
// Everything here is read-only and framework-free so each prototype can just
// import what it needs and focus on layout.
import { matchPoints } from '../assets/score.js';

export const GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

// Funnel order + how many matches sit in each knockout round. Drives the
// "ladder getting smaller" structure even before the feed names the teams.
export const KO_STAGES = [
  { key: 'LAST_32', label: 'Round of 32', short: 'R32', matches: 16 },
  { key: 'LAST_16', label: 'Round of 16', short: 'R16', matches: 8 },
  { key: 'QUARTER_FINALS', label: 'Quarter-finals', short: 'QF', matches: 4 },
  { key: 'SEMI_FINALS', label: 'Semi-finals', short: 'SF', matches: 2 },
  { key: 'FINAL', label: 'Final', short: 'Final', matches: 1 },
];

export async function loadAll() {
  const get = (p) => fetch(p, { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
    return r.json();
  });
  const [roster, data, predictions] = await Promise.all([
    get('../data/roster.json'),
    get('../data/matches.json'),
    get('../data/predictions.json').catch(() => null),
  ]);
  const ownersByCode = new Map(
    roster.flatMap((p) => p.teams.map((c) => [c, p.name]))
  );
  return {
    roster,
    matches: data.matches,
    lastUpdated: data.lastUpdated,
    predictions: predictions?.predictions || {},
    ownersByCode,
  };
}

// Stable colour per owner so a person's two teams read as a pair everywhere.
const PALETTE = [
  '#8ac646', '#e07a5f', '#3d8eb9', '#f2cc8f', '#9d6b53', '#c75c8f',
  '#5fa8a0', '#d98b3a', '#6c7bd1', '#7a9e3f', '#b5564f', '#4f9d69',
  '#bf7fb0', '#d4a017', '#5b8c9e', '#a0673a', '#8e7cc3', '#cf6679',
  '#5c9e5c', '#c98a2b', '#7f8fa6', '#b06a8a', '#4d8b7b', '#9a8f3f',
];
export function ownerColours(roster) {
  const m = new Map();
  roster.forEach((p, i) => m.set(p.name, PALETTE[i % PALETTE.length]));
  return m;
}

function blank(t) {
  return {
    code: t.code, name: t.name, crest: t.crest || '',
    played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0,
  };
}

// Standings for a single group, sorted on the same tiebreak the sweep uses
// (pts, GD, GF, name). Returns rows tagged with rank 1..4.
function tableFor(groupMatches) {
  const teams = new Map();
  const ensure = (t) => {
    if (!t?.code) return null;
    if (!teams.has(t.code)) teams.set(t.code, blank(t));
    return teams.get(t.code);
  };
  for (const m of groupMatches) { ensure(m.home); ensure(m.away); }
  for (const m of groupMatches) {
    if (m.status !== 'FINISHED' || m.homeScore == null || m.awayScore == null) continue;
    const h = ensure(m.home), a = ensure(m.away);
    if (!h || !a) continue;
    h.played++; a.played++;
    h.gf += m.homeScore; h.ga += m.awayScore;
    a.gf += m.awayScore; a.ga += m.homeScore;
    const pts = matchPoints(m);
    h.points += pts.home; a.points += pts.away;
    if (pts.home === pts.away) { h.drawn++; a.drawn++; }
    else if (pts.home === 3) { h.won++; a.lost++; }
    else { a.won++; h.lost++; }
  }
  const rows = [...teams.values()];
  rows.forEach((t) => { t.gd = t.gf - t.ga; });
  rows.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf
    || a.name.localeCompare(b.name));
  rows.forEach((t, i) => { t.rank = i + 1; });
  return rows;
}

// All 12 group tables plus best-third qualification, mirroring the 2026
// format: top two in each group go through, plus the eight best third-placed
// teams. Marks each team qualified | third (in contention) | out, and flags
// whether the group has finished so the UI can show "provisional" honestly.
export function groupStandings(matches) {
  const groupDone = (rows, gm) => gm.length > 0 && gm.every((m) => m.status === 'FINISHED');
  const groups = GROUP_LETTERS.map((letter) => {
    const key = `GROUP_${letter}`;
    const gm = matches.filter((m) => m.group === key);
    const rows = tableFor(gm);
    return { letter, key, rows, finished: groupDone(rows, gm) };
  });

  // Rank the third-placed teams against each other for the 8 wildcard spots.
  const thirds = groups.map((g) => g.rows[2]).filter(Boolean)
    .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf
      || a.name.localeCompare(b.name));
  const bestThirdCodes = new Set(thirds.slice(0, 8).map((t) => t.code));

  for (const g of groups) {
    g.rows.forEach((t) => {
      if (t.rank <= 2) t.status = 'qualified';
      else if (t.rank === 3) t.status = bestThirdCodes.has(t.code) ? 'qualified' : 'third';
      else t.status = 'out';
    });
  }
  return { groups, thirds, bestThirdCodes };
}

// Knockout matches grouped by round, in funnel order. Each round always has
// its full slot count; missing fixtures render as TBD placeholders so the
// structure shows even before the feed resolves the bracket.
export function knockoutRounds(matches) {
  return KO_STAGES.map((stage) => {
    const ms = matches
      .filter((m) => m.stage === stage.key)
      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
    const slots = [];
    for (let i = 0; i < stage.matches; i++) slots.push(ms[i] || null);
    return { ...stage, slots };
  });
}

export const isFinished = (m) =>
  m && m.status === 'FINISHED' && m.homeScore != null && m.awayScore != null;
export const isLive = (m) => m && (m.status === 'IN_PLAY' || m.status === 'PAUSED');
export const hasTeams = (m) => m && m.home?.code && m.away?.code;

export function winnerLoser(m) {
  if (!isFinished(m) || !m.winner || m.winner === 'DRAW') return { winner: null, loser: null };
  return m.winner === 'HOME_TEAM'
    ? { winner: m.home, loser: m.away }
    : { winner: m.away, loser: m.home };
}

export function champion(matches) {
  const final = matches.find((m) => m.stage === 'FINAL');
  return final ? winnerLoser(final).winner : null;
}

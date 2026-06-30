// Tournament bracket for the live dashboard. A two-sided knockout tree that
// meets at the final, fed by the 12 group tables. Reuses the scoring rules in
// score.js; clicks route into the app's existing team / match modals.
import { matchPoints, decideWinner } from './score.js';

const GROUP_LETTERS = ['A','B','C','D','E','F','G','H','I','J','K','L'];

// Funnel order + slot count per knockout round. Drives the structure even
// before the feed names the teams.
const KO_STAGES = [
  { key: 'LAST_32', label: 'Round of 32', matches: 16 },
  { key: 'LAST_16', label: 'Round of 16', matches: 8 },
  { key: 'QUARTER_FINALS', label: 'Quarters', matches: 4 },
  { key: 'SEMI_FINALS', label: 'Semis', matches: 2 },
  { key: 'FINAL', label: 'Final', matches: 1 },
];

const el = (t, c, x) => {
  const n = document.createElement(t);
  if (c) n.className = c;
  if (x !== undefined) n.textContent = x;
  return n;
};
const fmtDate = (d) => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' });

const isFinished = (m) => m && m.status === 'FINISHED' && m.homeScore != null && m.awayScore != null;
const isLive = (m) => m && (m.status === 'IN_PLAY' || m.status === 'PAUSED');
const hasTeams = (m) => m && m.home?.code && m.away?.code;

function winnerOf(m) {
  const decided = decideWinner(m);
  if (!decided || decided === 'DRAW') return null;
  return decided === 'HOME_TEAM' ? m.home : m.away;
}

// Stable colour per owner so a person's two teams read as a pair.
const PALETTE = [
  '#8ac646', '#e07a5f', '#3d8eb9', '#d99a1c', '#9d6b53', '#c75c8f',
  '#5fa8a0', '#d9743a', '#6c7bd1', '#7a9e3f', '#b5564f', '#4f9d69',
  '#bf7fb0', '#b08a17', '#5b8c9e', '#a0673a', '#8e7cc3', '#cf6679',
  '#5c9e5c', '#c98a2b', '#7f8fa6', '#b06a8a', '#4d8b7b', '#9a8f3f',
];
function ownerColours(roster) {
  const m = new Map();
  roster.forEach((p, i) => m.set(p.name, PALETTE[i % PALETTE.length]));
  return m;
}

function blank(t) {
  return { code: t.code, name: t.name, crest: t.crest || '',
    played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 };
}

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

// 12 group tables + 2026 qualification: top two per group plus the eight best
// third-placed teams. Each team tagged qualified | third | out.
function groupStandings(matches) {
  const groups = GROUP_LETTERS.map((letter) => {
    const key = `GROUP_${letter}`;
    const gm = matches.filter((m) => m.group === key);
    const rows = tableFor(gm);
    return { letter, rows, finished: gm.length > 0 && gm.every((m) => m.status === 'FINISHED') };
  });
  const thirds = groups.map((g) => g.rows[2]).filter(Boolean)
    .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf
      || a.name.localeCompare(b.name));
  const best = new Set(thirds.slice(0, 8).map((t) => t.code));
  for (const g of groups) {
    g.rows.forEach((t) => {
      if (t.rank <= 2) t.status = 'qualified';
      else if (t.rank === 3) t.status = best.has(t.code) ? 'qualified' : 'third';
      else t.status = 'out';
    });
  }
  return groups;
}

function knockoutRounds(matches) {
  return KO_STAGES.map((stage) => {
    const ms = matches.filter((m) => m.stage === stage.key)
      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
    const slots = [];
    for (let i = 0; i < stage.matches; i++) slots.push(ms[i] || null);
    return { ...stage, slots };
  });
}

function statusClass(s) { return s === 'qualified' ? 'q' : s === 'third' ? 't' : 'out'; }

function groupCard(g, onTeam) {
  const card = el('div', 'bk-group');
  const h = el('div', 'bk-group-head');
  h.append(el('span', null, 'Group ' + g.letter));
  if (!g.finished) h.append(el('span', 'bk-live', 'live'));
  card.append(h);
  g.rows.forEach((t) => {
    const row = el('button', 'bk-trow ' + statusClass(t.status));
    row.type = 'button';
    row.append(el('span', 'bk-rank', String(t.rank)));
    if (t.crest) { const i = el('img', 'bk-crest'); i.src = t.crest; i.alt = ''; row.append(i); }
    row.append(el('span', 'bk-name', t.name));
    row.append(el('span', 'bk-pts', String(t.points)));
    row.addEventListener('click', () => onTeam && onTeam(t.code));
    card.append(row);
  });
  return card;
}

function matchBox(m, ctx) {
  if (!m || !hasTeams(m)) {
    const box = el('div', 'bk-box tbd');
    const a = el('div', 'bk-side'); a.append(el('span', 'bk-name', (m && m.home?.name) || 'TBD')); box.append(a);
    const b = el('div', 'bk-side'); b.append(el('span', 'bk-name', (m && m.away?.name) || 'TBD')); box.append(b);
    box.append(el('div', 'bk-meta', m ? fmtDate(m.utcDate) : ''));
    return box;
  }
  const box = el('button', 'bk-box');
  box.type = 'button';
  const winner = winnerOf(m);
  const side = (team, score) => {
    const won = winner && winner.code === team.code;
    const lost = winner && winner.code !== team.code;
    const row = el('div', 'bk-side' + (won ? ' win' : lost ? ' lose' : ''));
    const dot = el('span', 'bk-dot');
    const owner = ctx.ownersByCode.get(team.code);
    if (owner) dot.style.background = ctx.colours.get(owner) || 'transparent';
    row.append(dot);
    if (team.crest) { const i = el('img', 'bk-crest'); i.src = team.crest; i.alt = ''; row.append(i); }
    row.append(el('span', 'bk-name', team.name));
    if (score != null) row.append(el('span', 'bk-score', String(score)));
    return row;
  };
  box.append(side(m.home, m.homeScore));
  box.append(side(m.away, m.awayScore));
  const meta = isLive(m) ? 'LIVE'
    : isFinished(m) ? (m.decidedBy === 'PENALTIES' ? 'pens' : m.decidedBy === 'EXTRA_TIME' ? 'aet' : 'full time')
    : fmtDate(m.utcDate);
  box.append(el('div', 'bk-meta' + (isLive(m) ? ' live' : ''), meta));
  box.addEventListener('click', () => ctx.onMatch && ctx.onMatch(m));
  return box;
}

// One round column: a fixed-height label then a body of equal-height cells so
// the CSS connectors line up exactly. Pairs of cells feed one cell next round.
function column(matches, label, ctx) {
  const col = el('div', 'bk-col' + (matches.length >= 2 ? ' has-pairs' : ''));
  col.append(el('div', 'bk-collabel', label));
  const body = el('div', 'bk-body');
  matches.forEach((m) => {
    const cell = el('div', 'bk-cell');
    cell.append(matchBox(m, ctx));
    body.append(cell);
  });
  col.append(body);
  return col;
}

export function renderBracket(root, { matches, roster, ownersByCode }, handlers = {}) {
  root.innerHTML = '';
  const colours = ownerColours(roster);
  const ctx = { ownersByCode, colours, onTeam: handlers.onTeam, onMatch: handlers.onMatch };

  // Groups: only while the group stage is still relevant. Once every group has
  // finished the knockouts tell the story, so drop the tables.
  const groups = groupStandings(matches);
  const groupStageOver = groups.length > 0 && groups.every((g) => g.finished);
  if (!groupStageOver) {
    const gWrap = el('div', 'bk-groups');
    const gHead = el('div', 'bk-section-head');
    gHead.append(el('h3', null, 'Groups'));
    gHead.append(el('span', 'bk-hint', 'Top 2 + 8 best 3rd-placed go through'));
    gWrap.append(gHead);
    const grid = el('div', 'bk-group-grid');
    groups.forEach((g) => grid.append(groupCard(g, ctx.onTeam)));
    gWrap.append(grid);
    root.append(gWrap);
  }

  // Knockout tree
  const rounds = knockoutRounds(matches);
  const byKey = Object.fromEntries(rounds.map((r) => [r.key, r.slots]));
  const labelOf = Object.fromEntries(KO_STAGES.map((s) => [s.key, s.label]));
  const half = (slots) => [slots.slice(0, slots.length / 2), slots.slice(slots.length / 2)];
  const [r32L, r32R] = half(byKey.LAST_32);
  const [r16L, r16R] = half(byKey.LAST_16);
  const [qfL, qfR] = half(byKey.QUARTER_FINALS);
  const [sfL, sfR] = half(byKey.SEMI_FINALS);
  const finalM = byKey.FINAL[0];

  const treeWrap = el('div', 'bk-treewrap');
  treeWrap.append(el('div', 'bk-scrollhint', 'Knockouts (scroll) →'));
  const tree = el('div', 'bk-tree');

  const left = el('div', 'bk-half left');
  left.append(column(r32L, labelOf.LAST_32, ctx));
  left.append(column(r16L, labelOf.LAST_16, ctx));
  left.append(column(qfL, labelOf.QUARTER_FINALS, ctx));
  left.append(column(sfL, labelOf.SEMI_FINALS, ctx));
  tree.append(left);

  const finalCol = el('div', 'bk-col bk-finalcol');
  finalCol.append(el('div', 'bk-collabel', 'Final'));
  const fbody = el('div', 'bk-body');
  const fcell = el('div', 'bk-cell');
  const fbox = el('div', 'bk-finalbox');
  fbox.append(el('div', 'bk-trophy', '\u{1F3C6}'));
  fbox.append(matchBox(finalM, ctx));
  const champ = winnerOf(finalM);
  if (champ) {
    fbox.append(el('div', 'bk-champ-name', champ.name));
    const own = ownersByCode.get(champ.code);
    if (own) fbox.append(el('div', 'bk-champ-own', own + ' wins the sweep'));
  } else {
    fbox.append(el('div', 'bk-champ-own', 'Champions decided 19 Jul'));
  }
  fcell.append(fbox);
  fbody.append(fcell);
  finalCol.append(fbody);
  tree.append(finalCol);

  const right = el('div', 'bk-half right');
  right.append(column(sfR, labelOf.SEMI_FINALS, ctx));
  right.append(column(qfR, labelOf.QUARTER_FINALS, ctx));
  right.append(column(r16R, labelOf.LAST_16, ctx));
  right.append(column(r32R, labelOf.LAST_32, ctx));
  tree.append(right);

  treeWrap.append(tree);
  root.append(treeWrap);
  root.append(el('p', 'bk-note',
    'Group standings are live. Knockout fixtures fill as games finish; bracket pairings are illustrative until the draw resolves.'));
}

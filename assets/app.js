import { computeTeamTable, computeLeaderboard, teamMatches, matchPoints } from './score.js';

let allMatches = [];
let teamTableRef = new Map();
let ownersByCode = new Map();
let predictionsById = {};

const STAGE_LABELS = {
  GROUP_STAGE: 'Groups', LAST_32: 'R32', LAST_16: 'R16',
  QUARTER_FINALS: 'QF', SEMI_FINALS: 'SF', THIRD_PLACE: '3rd place', FINAL: 'Final',
};

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function teamChip(team) {
  const chip = el('button', 'chip' + (team.exitStage ? ' out' : ''));
  chip.type = 'button';
  if (team.crest) {
    const img = el('img', 'crest');
    img.src = team.crest;
    img.alt = '';
    chip.append(img);
  }
  chip.append(el('span', 'chip-name', team.name));
  chip.append(el('span', 'chip-pts', `${team.points}`));
  if (team.unknown) chip.append(el('span', 'badge warn', 'unknown code'));
  else if (team.champion) chip.append(el('span', 'badge gold', 'CHAMPIONS'));
  else if (team.exitStage) chip.append(el('span', 'badge', `out ${STAGE_LABELS[team.exitStage] || team.exitStage}`));
  if (!team.unknown) {
    chip.setAttribute('aria-label', `Show ${team.name} matches`);
    chip.addEventListener('click', () => openTeamModal(team.code));
  } else {
    chip.disabled = true;
  }
  return chip;
}

function closeTeamModal() {
  document.querySelector('.modal-overlay')?.remove();
  document.removeEventListener('keydown', onModalKeydown);
}

function onModalKeydown(e) {
  if (e.key === 'Escape') closeTeamModal();
}

function teamModalRow({ match, isHome, outcome, pensProgressed }) {
  const opponent = isHome ? match.away : match.home;
  const row = el('div', 'tm-row' + (outcome === null ? ' upcoming' : ''));

  const when = el('div', 'tm-when');
  const date = new Date(match.utcDate);
  when.append(el('div', 'tm-date', date.toLocaleDateString([], { day: 'numeric', month: 'short' })));
  const stage = match.group ? match.group.replace('GROUP_', 'Group ') : STAGE_LABELS[match.stage] || match.stage;
  when.append(el('div', 'tm-stage', stage));
  row.append(when);

  const opp = el('div', 'tm-opp');
  if (opponent.crest) {
    const img = el('img', 'crest');
    img.src = opponent.crest;
    img.alt = '';
    opp.append(img);
  }
  opp.append(el('span', null, `vs ${opponent.name}`));
  row.append(opp);

  const right = el('div', 'tm-result');
  if (outcome === null) {
    right.append(el('span', 'tm-kickoff',
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
  } else {
    const us = isHome ? match.homeScore : match.awayScore;
    const them = isHome ? match.awayScore : match.homeScore;
    right.append(el('span', 'tm-score', `${us} - ${them}`));
    if (pensProgressed !== null) {
      right.append(el('span', 'tm-pens', pensProgressed ? 'through on pens' : 'out on pens'));
    }
    right.append(el('span', `result-badge result-${outcome.toLowerCase()}`, outcome));
  }
  row.append(right);
  return row;
}

function openTeamModal(code) {
  closeTeamModal();
  const team = teamTableRef.get(code);
  if (!team) return;
  const history = teamMatches(allMatches, code);

  const overlay = el('div', 'modal-overlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeTeamModal(); });
  const modal = el('div', 'modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', `${team.name} matches`);

  const head = el('div', 'modal-head');
  if (team.crest) {
    const img = el('img', 'modal-crest');
    img.src = team.crest;
    img.alt = '';
    head.append(img);
  }
  const info = el('div', 'modal-info');
  info.append(el('div', 'modal-team', team.name));
  info.append(el('div', 'modal-record',
    `${team.won}W ${team.drawn}D ${team.lost}L · ${team.points} pts · GD ${team.gd > 0 ? '+' : ''}${team.gd}`));
  if (team.champion) info.append(el('span', 'badge gold', 'CHAMPIONS'));
  else if (team.exitStage) info.append(el('span', 'badge', `out ${STAGE_LABELS[team.exitStage] || team.exitStage}`));
  head.append(info);
  const close = el('button', 'modal-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', closeTeamModal);
  head.append(close);
  modal.append(head);

  const list = el('div', 'tm-list');
  if (history.length) history.forEach((h) => list.append(teamModalRow(h)));
  else list.append(el('p', 'empty', 'No matches in the feed for this team yet.'));
  modal.append(list);

  overlay.append(modal);
  document.body.append(overlay);
  document.addEventListener('keydown', onModalKeydown);
  close.focus();
}

function renderLeaderHero(board) {
  const hero = document.querySelector('#leader-hero');
  if (!board.length || board.every((p) => p.points === 0)) return;
  const leaders = board.filter((p) => p.points === board[0].points
    && p.gd === board[0].gd && p.gf === board[0].gf);
  const names = leaders.map((p) => p.name);
  hero.classList.remove('hidden');
  hero.append(el('div', 'crown', '\u{1F451}'));
  const text = el('div', 'leader-text');
  text.append(el('div', 'leader-name', names.join(' & ')));
  text.append(el('div', 'leader-sub',
    names.length > 1 ? `tied on ${board[0].points} pts` : `leading with ${board[0].points} pts`));
  hero.append(text);
}

function renderLeaderboard(board) {
  const root = document.querySelector('#leaderboard');
  const table = el('table');
  const head = el('tr');
  for (const h of ['#', 'Name', 'Teams', 'Pts', 'GD', 'GF']) head.append(el('th', null, h));
  table.append(head);
  board.forEach((person, i) => {
    const row = el('tr', i === 0 ? 'top' : null);
    row.append(el('td', 'rank', person.tied ? `${i + 1}=` : `${i + 1}`));
    row.append(el('td', 'name', person.name));
    const teams = el('td', 'teams');
    person.teams.forEach((t) => teams.append(teamChip(t)));
    row.append(teams);
    row.append(el('td', 'num pts', `${person.points}`));
    row.append(el('td', 'num', `${person.gd > 0 ? '+' : ''}${person.gd}`));
    row.append(el('td', 'num', `${person.gf}`));
    table.append(row);
  });
  root.append(table);
}

function matchCard(match) {
  const card = el('button', 'match');
  card.type = 'button';
  card.setAttribute('aria-label', `${match.home.name} v ${match.away.name}: details`);
  card.addEventListener('click', () => openMatchModal(match));
  const stage = match.group
    ? match.group.replace('GROUP_', 'Group ')
    : STAGE_LABELS[match.stage] || match.stage;
  card.append(el('div', 'match-stage', stage));
  const line = el('div', 'match-line');
  line.append(el('span', 'team home', match.home.name));
  const score = match.homeScore === null ? 'v' : `${match.homeScore} : ${match.awayScore}`;
  line.append(el('span', 'score', score));
  line.append(el('span', 'team away', match.away.name));
  card.append(line);
  const meta = [];
  if (match.status === 'IN_PLAY' || match.status === 'PAUSED') meta.push('LIVE');
  if (match.decidedBy === 'PENALTIES') meta.push('pens');
  if (match.decidedBy === 'EXTRA_TIME') meta.push('aet');
  if (match.status === 'TIMED' || match.status === 'SCHEDULED') {
    meta.push(new Date(match.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  }
  if (meta.length) card.append(el('div', 'match-meta' + (meta.includes('LIVE') ? ' live' : ''), meta.join(' · ')));
  return card;
}

function pointsChip(points) {
  const cls = points === 3 ? 'mm-pts win' : points === 1 ? 'mm-pts draw' : 'mm-pts loss';
  return el('span', cls, `+${points} pts`);
}

function matchModalSide(team, points) {
  const side = el('div', 'mm-side');
  if (team.crest) {
    const img = el('img', 'mm-crest');
    img.src = team.crest;
    img.alt = '';
    side.append(img);
  }
  side.append(el('div', 'mm-country', team.name));
  const owner = team.code ? ownersByCode.get(team.code) : null;
  side.append(el('div', 'mm-owner', owner || 'unclaimed'));
  if (points !== null) side.append(pointsChip(points));
  return side;
}

function openMatchModal(match) {
  closeTeamModal();
  const overlay = el('div', 'modal-overlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeTeamModal(); });
  const modal = el('div', 'modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', `${match.home.name} v ${match.away.name}`);

  const head = el('div', 'modal-head');
  const info = el('div', 'modal-info');
  const stage = match.group ? match.group.replace('GROUP_', 'Group ') : STAGE_LABELS[match.stage] || match.stage;
  info.append(el('div', 'modal-team', stage));
  info.append(el('div', 'modal-record', new Date(match.utcDate).toLocaleString([], {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })));
  head.append(info);
  const close = el('button', 'modal-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', closeTeamModal);
  head.append(close);
  modal.append(head);

  const pts = matchPoints(match);
  const body = el('div', 'mm');
  body.append(matchModalSide(match.home, pts ? pts.home : null));

  const centre = el('div', 'mm-centre');
  if (match.homeScore !== null) {
    centre.append(el('div', 'mm-score', `${match.homeScore} - ${match.awayScore}`));
    if (match.decidedBy === 'PENALTIES') {
      const through = match.winner === 'HOME_TEAM' ? match.home.name : match.away.name;
      centre.append(el('div', 'mm-note', `${through} through on pens`));
    } else if (match.decidedBy === 'EXTRA_TIME') {
      centre.append(el('div', 'mm-note', 'after extra time'));
    }
    if (match.status === 'IN_PLAY' || match.status === 'PAUSED') {
      centre.append(el('div', 'mm-note live', 'LIVE'));
    }
  } else {
    centre.append(el('div', 'mm-score muted', 'v'));
    centre.append(el('div', 'mm-note', new Date(match.utcDate).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit',
    })));
  }
  body.append(centre);
  body.append(matchModalSide(match.away, pts ? pts.away : null));
  modal.append(body);

  const prediction = predictionFor(match);
  if (prediction) modal.append(predictionBar(match, prediction, 'mm-predict'));

  const homeOwner = match.home.code ? ownersByCode.get(match.home.code) : null;
  const awayOwner = match.away.code ? ownersByCode.get(match.away.code) : null;
  if (homeOwner && awayOwner) {
    const line = homeOwner === awayOwner
      ? `${homeOwner} owns both teams. Cannot lose this one.`
      : `${homeOwner} v ${awayOwner} in the sweep`;
    modal.append(el('div', 'mm-sweep-line', line));
  }

  overlay.append(modal);
  document.body.append(overlay);
  document.addEventListener('keydown', onModalKeydown);
  close.focus();
}

function predictionFor(match) {
  if (match.status !== 'TIMED' && match.status !== 'SCHEDULED') return null;
  return predictionsById[match.id] || null;
}

function predictionBar(match, p, cls) {
  const wrap = el('div', cls);
  const bar = el('div', 'predict-bar');
  for (const [cls, share] of [['seg-home', p.home], ['seg-draw', p.draw], ['seg-away', p.away]]) {
    const seg = el('span', cls);
    seg.style.width = `${share * 100}%`;
    bar.append(seg);
  }
  wrap.append(bar);
  const legend = el('div', 'predict-legend');
  const top = Math.max(p.home, p.draw, p.away);
  const entry = (name, share) =>
    el('span', share === top ? 'predict-fav' : null, `${name} ${Math.round(share * 100)}%`);
  legend.append(entry(match.home.name, p.home));
  legend.append(entry('Draw', p.draw));
  legend.append(entry(match.away.name, p.away));
  wrap.append(legend);
  return wrap;
}

function dayLabel(date, now) {
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
}

function feedSide(team, away) {
  const side = el('span', 'feed-team' + (away ? ' away' : ''));
  const name = el('span', null, team.name);
  if (team.crest) {
    const img = el('img', 'crest');
    img.src = team.crest;
    img.alt = '';
    if (away) side.append(name, img); else side.append(img, name);
  } else {
    side.append(name);
  }
  return side;
}

function feedRow(match, isLive) {
  const row = el('button', 'feed-row');
  row.type = 'button';
  row.addEventListener('click', () => openMatchModal(match));

  const when = el('div', 'feed-when');
  if (isLive) {
    when.append(el('div', 'feed-live', 'LIVE'));
    when.append(el('div', 'feed-score', `${match.homeScore ?? 0} - ${match.awayScore ?? 0}`));
  } else {
    when.append(el('div', 'feed-time',
      new Date(match.utcDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
    const stage = match.group ? match.group.replace('GROUP_', 'Grp ') : STAGE_LABELS[match.stage] || match.stage;
    when.append(el('div', 'feed-stage', stage));
  }
  row.append(when);

  const middle = el('div', 'feed-middle');
  const line = el('div', 'feed-line');
  line.append(feedSide(match.home, false));
  line.append(el('span', 'feed-v', 'v'));
  line.append(feedSide(match.away, true));
  middle.append(line);
  const homeOwner = match.home.code ? ownersByCode.get(match.home.code) : null;
  const awayOwner = match.away.code ? ownersByCode.get(match.away.code) : null;
  if (homeOwner && awayOwner) {
    middle.append(el('div', 'feed-owners',
      homeOwner === awayOwner ? `${homeOwner} v ${homeOwner} (owns both!)` : `${homeOwner} v ${awayOwner}`));
  }
  const prediction = predictionFor(match);
  if (prediction) middle.append(predictionBar(match, prediction, 'feed-predict'));
  row.append(middle);
  row.append(el('span', 'feed-chevron', '›'));
  return row;
}

function renderFeed(matches) {
  const feed = document.querySelector('#feed');
  const now = new Date();
  const live = matches
    .filter((m) => m.status === 'IN_PLAY' || m.status === 'PAUSED')
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  const upcoming = matches
    .filter((m) => m.status === 'TIMED' || m.status === 'SCHEDULED')
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
    .slice(0, 10);
  if (!live.length && !upcoming.length) {
    feed.append(el('p', 'empty', 'No more games. What a tournament.'));
    return;
  }
  if (live.length) {
    feed.append(el('div', 'feed-day', 'On now'));
    live.forEach((m) => feed.append(feedRow(m, true)));
  }
  let lastLabel = null;
  for (const match of upcoming) {
    const label = dayLabel(new Date(match.utcDate), now);
    if (label !== lastLabel) {
      feed.append(el('div', 'feed-day', label));
      lastLabel = label;
    }
    feed.append(feedRow(match, false));
  }
}

function tickerSide(team, away) {
  const side = el('span', 'tk-team' + (away ? ' away' : ''));
  const label = el('span', 'tk-code', team.code || team.name);
  if (team.crest) {
    const img = el('img', 'tk-crest');
    img.src = team.crest;
    img.alt = '';
    if (away) side.append(label, img); else side.append(img, label);
  } else {
    side.append(label);
  }
  return side;
}

function tickerTag(match) {
  if (match.status === 'IN_PLAY' || match.status === 'PAUSED') return { text: 'LIVE', live: true };
  if (match.status === 'FINISHED') {
    if (match.decidedBy === 'PENALTIES') return { text: 'FT pens' };
    if (match.decidedBy === 'EXTRA_TIME') return { text: 'FT aet' };
    return { text: 'FT' };
  }
  return {
    text: new Date(match.utcDate).toLocaleString([], {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }),
  };
}

function tickerItem(match) {
  const item = el('button', 'tk-item');
  item.type = 'button';
  item.addEventListener('click', () => openMatchModal(match));
  const tag = tickerTag(match);
  item.append(el('span', 'tk-tag' + (tag.live ? ' live' : ''), tag.text));
  item.append(tickerSide(match.home, false));
  const score = match.homeScore === null ? 'v' : `${match.homeScore}-${match.awayScore}`;
  item.append(el('span', 'tk-score' + (tag.live ? ' live' : ''), score));
  item.append(tickerSide(match.away, true));
  return item;
}

function renderTicker(matches) {
  const ticker = document.querySelector('#ticker');
  const live = matches
    .filter((m) => m.status === 'IN_PLAY' || m.status === 'PAUSED')
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  const finished = matches
    .filter((m) => m.status === 'FINISHED')
    .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
    .slice(0, 12);
  const upcoming = matches
    .filter((m) => m.status === 'TIMED' || m.status === 'SCHEDULED')
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
    .slice(0, 6);
  const ordered = [...live, ...finished, ...upcoming];
  if (!ordered.length) {
    ticker.hidden = true;
    return;
  }
  ticker.hidden = false;
  const track = el('div', 'ticker-track');
  // Render the run twice so the marquee loops seamlessly at translateX(-50%).
  ordered.forEach((m) => track.append(tickerItem(m)));
  ordered.forEach((m) => track.append(tickerItem(m)));
  track.style.setProperty('--tk-duration', `${Math.max(ordered.length * 4, 20)}s`);
  ticker.append(track);
}

function renderLatest(matches) {
  const latest = document.querySelector('#latest');
  const finished = matches
    .filter((m) => m.status === 'FINISHED')
    .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
    .slice(0, 8);
  if (finished.length) finished.forEach((m) => latest.append(matchCard(m)));
  else latest.append(el('p', 'empty', 'No results yet.'));
}

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

function clearSections() {
  const hero = document.querySelector('#leader-hero');
  hero.innerHTML = '';
  hero.classList.add('hidden');
  for (const id of ['#ticker', '#leaderboard', '#feed', '#latest']) {
    document.querySelector(id).innerHTML = '';
  }
}

async function main() {
  const updated = document.querySelector('#updated');
  try {
    clearSections();
    const [roster, data, predictions] = await Promise.all([
      loadJson('data/roster.json'),
      loadJson('data/matches.json'),
      loadJson('data/predictions.json').catch(() => null),
    ]);
    predictionsById = predictions?.predictions || {};
    const teamTable = computeTeamTable(data.matches);
    allMatches = data.matches;
    teamTableRef = teamTable;
    ownersByCode = new Map(roster.flatMap((p) => p.teams.map((code) => [code, p.name])));
    const board = computeLeaderboard(roster, teamTable);
    renderTicker(data.matches);
    renderLeaderHero(board);
    renderLeaderboard(board);
    renderFeed(data.matches);
    renderLatest(data.matches);
    updated.textContent = data.lastUpdated
      ? `Updated ${new Date(data.lastUpdated).toLocaleString()}`
      : 'Waiting for the first score sync';
  } catch (err) {
    updated.textContent = `Could not load data: ${err.message}`;
  }
}

// Remove any image that fails to load instead of showing a broken icon.
document.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG') e.target.remove();
}, true);

main();

// Keep an open tab current: re-fetch every 10 minutes unless a modal is open.
setInterval(() => {
  if (!document.querySelector('.modal-overlay')) main();
}, 10 * 60 * 1000);

import { computeTeamTable, computeLeaderboard } from './score.js';

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
  const chip = el('span', 'chip' + (team.exitStage ? ' out' : ''));
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
  return chip;
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
  const card = el('div', 'match');
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

function renderMatches(matches) {
  const today = document.querySelector('#today');
  const latest = document.querySelector('#latest');
  const now = new Date();
  const isToday = (d) => {
    const date = new Date(d);
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  };
  const todays = matches.filter((m) => isToday(m.utcDate));
  if (todays.length) todays.forEach((m) => today.append(matchCard(m)));
  else today.append(el('p', 'empty', 'No matches today.'));
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

async function main() {
  const updated = document.querySelector('#updated');
  try {
    const [roster, data] = await Promise.all([
      loadJson('data/roster.json'),
      loadJson('data/matches.json'),
    ]);
    const teamTable = computeTeamTable(data.matches);
    const board = computeLeaderboard(roster, teamTable);
    renderLeaderHero(board);
    renderLeaderboard(board);
    renderMatches(data.matches);
    updated.textContent = data.lastUpdated
      ? `Updated ${new Date(data.lastUpdated).toLocaleString()}`
      : 'Waiting for the first score sync';
  } catch (err) {
    updated.textContent = `Could not load data: ${err.message}`;
  }
}

main();

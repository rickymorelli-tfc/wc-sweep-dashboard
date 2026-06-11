# WC 2026 Sweep Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Static GitHub Pages dashboard showing the TFC World Cup 2026 office-sweep leaderboard, fed by a scheduled GitHub Action pulling scores from football-data.org.

**Architecture:** A no-dependency Node fetch script normalises the football-data.org WC feed into `data/matches.json`, committed by a cron GitHub Action. A pure ES-module scoring engine (`assets/score.js`) is shared by the browser page and Node tests. `index.html` renders leaderboard, today's fixtures, and latest results client-side from two JSON files.

**Tech Stack:** Plain HTML/CSS/JS (ES modules), Node 20+ built-in test runner, GitHub Actions, GitHub Pages. Zero npm dependencies.

---

### Task 1: Repo scaffolding

**Files:**
- Create: `package.json`, `.gitignore`, `README.md`, `data/matches.json`, `data/roster.json`

- [ ] **Step 1: Write scaffolding files**

`package.json`:
```json
{
  "name": "wc-sweep-dashboard",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/",
    "fetch": "node scripts/fetch-scores.js"
  }
}
```

`.gitignore`:
```
.DS_Store
node_modules/
.env
```

`data/matches.json` (seed, replaced by first fetch):
```json
{ "lastUpdated": null, "matches": [] }
```

`data/roster.json` (placeholder names, Ricky replaces with the real TFC draw; teams are football-data TLA codes):
```json
[
  { "name": "EDIT-ME Person 1", "teams": ["ARG", "AUS"] },
  { "name": "EDIT-ME Person 2", "teams": ["FRA", "JPN"] },
  { "name": "EDIT-ME Person 3", "teams": ["BRA", "USA"] },
  { "name": "EDIT-ME Person 4", "teams": ["ENG", "MEX"] }
]
```

`README.md`:
```markdown
# TFC World Cup 2026 Sweep Dashboard

Office sweep for the 2026 FIFA World Cup. Everyone has two teams (one from
each half of the draw). Points across the whole tournament: win 3, draw 1,
loss 0 (penalty shootouts count as draws, FIFA-ranking style). Highest
combined total leads. Tiebreakers: goal difference, then goals scored.

## How it updates
A GitHub Action runs every 2 hours, pulls scores from football-data.org and
commits `data/matches.json`. GitHub Pages serves the static page.

## Setup
1. Get a free API key at https://www.football-data.org/client/register
2. Add it as repo secret `FOOTBALL_DATA_TOKEN`
3. Edit `data/roster.json` with first names and team TLA codes (see the
   `home.code` / `away.code` values in `data/matches.json` after the first
   sync)
4. Run the "Update scores" workflow manually once to seed data

## Local dev
- `npm test` runs the scoring tests
- `python3 -m http.server 8123` then open http://localhost:8123
```

- [ ] **Step 2: Commit**
```bash
git add -A && git commit -m "chore: scaffold repo"
```

### Task 2: Team scoring table (TDD)

**Files:**
- Create: `test/score.test.js`, `assets/score.js`

- [ ] **Step 1: Write failing tests for computeTeamTable**

`test/score.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTeamTable, computeLeaderboard } from '../assets/score.js';

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
```

- [ ] **Step 2: Run, confirm failure**
Run: `npm test`  Expected: FAIL (cannot find `../assets/score.js`)

- [ ] **Step 3: Implement computeTeamTable**

`assets/score.js`:
```js
export const STAGE_ORDER = [
  'GROUP_STAGE', 'LAST_32', 'LAST_16', 'QUARTER_FINALS',
  'SEMI_FINALS', 'THIRD_PLACE', 'FINAL',
];

function blankTeam(t) {
  return {
    code: t.code, name: t.name, crest: t.crest || '',
    played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0,
    exitStage: null, champion: false,
  };
}

export function computeTeamTable(matches) {
  const teams = new Map();
  const ensure = (t) => {
    if (!t || !t.code) return null;
    if (!teams.has(t.code)) teams.set(t.code, blankTeam(t));
    return teams.get(t.code);
  };
  for (const match of matches) { ensure(match.home); ensure(match.away); }
  for (const match of matches) {
    if (match.status !== 'FINISHED') continue;
    const home = ensure(match.home);
    const away = ensure(match.away);
    if (!home || !away) continue;
    home.played++; away.played++;
    home.gf += match.homeScore; home.ga += match.awayScore;
    away.gf += match.awayScore; away.ga += match.homeScore;
    const isDraw = match.decidedBy === 'PENALTIES' || match.homeScore === match.awayScore;
    if (isDraw) {
      home.drawn++; away.drawn++; home.points += 1; away.points += 1;
    } else if (match.homeScore > match.awayScore) {
      home.won++; away.lost++; home.points += 3;
    } else {
      away.won++; home.lost++; away.points += 3;
    }
  }
  for (const team of teams.values()) team.gd = team.gf - team.ga;
  applyEliminations(teams, matches);
  return teams;
}

function applyEliminations(teams, matches) {
  const knockout = matches.filter(
    (m) => m.stage !== 'GROUP_STAGE' && m.stage !== 'THIRD_PLACE'
  );
  for (const match of knockout) {
    if (match.status !== 'FINISHED' || !match.winner || match.winner === 'DRAW') continue;
    const loser = match.winner === 'HOME_TEAM' ? match.away : match.home;
    const winner = match.winner === 'HOME_TEAM' ? match.home : match.away;
    if (loser?.code && teams.has(loser.code)) teams.get(loser.code).exitStage = match.stage;
    if (match.stage === 'FINAL' && winner?.code && teams.has(winner.code)) {
      teams.get(winner.code).champion = true;
    }
  }
  const groupMatches = matches.filter((m) => m.stage === 'GROUP_STAGE');
  const groupsDone = groupMatches.length > 0 && groupMatches.every((m) => m.status === 'FINISHED');
  const knockoutTeams = new Set(
    knockout.flatMap((m) => [m.home?.code, m.away?.code]).filter(Boolean)
  );
  if (groupsDone && knockoutTeams.size > 0) {
    for (const team of teams.values()) {
      if (!knockoutTeams.has(team.code) && !team.exitStage) team.exitStage = 'GROUP_STAGE';
    }
  }
}
```

- [ ] **Step 4: Run tests**
Run: `npm test`  Expected: Task 2 tests PASS (leaderboard tests not written yet)

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat: team scoring table with eliminations"
```

### Task 3: Person leaderboard (TDD)

**Files:**
- Modify: `test/score.test.js`, `assets/score.js`

- [ ] **Step 1: Append failing leaderboard tests**

Append to `test/score.test.js`:
```js
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
```

- [ ] **Step 2: Run, confirm new tests fail**
Run: `npm test`  Expected: FAIL (`computeLeaderboard` not exported)

- [ ] **Step 3: Implement computeLeaderboard**

Append to `assets/score.js`:
```js
export function computeLeaderboard(roster, teamTable) {
  const entries = roster.map((person) => {
    const teams = person.teams.map(
      (code) => teamTable.get(code) || { ...blankTeam({ code, name: code }), unknown: true }
    );
    return {
      name: person.name,
      teams,
      points: teams.reduce((sum, t) => sum + t.points, 0),
      gd: teams.reduce((sum, t) => sum + t.gd, 0),
      gf: teams.reduce((sum, t) => sum + t.gf, 0),
      tied: false,
    };
  });
  entries.sort(
    (a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name)
  );
  for (let i = 0; i < entries.length; i++) {
    for (const other of [entries[i - 1], entries[i + 1]]) {
      if (other && sameRank(entries[i], other)) entries[i].tied = true;
    }
  }
  return entries;
}

function sameRank(a, b) {
  return a.points === b.points && a.gd === b.gd && a.gf === b.gf;
}
```

- [ ] **Step 4: Run tests**
Run: `npm test`  Expected: all PASS

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat: person leaderboard with tiebreakers"
```

### Task 4: Fetch script with tested normaliser

**Files:**
- Create: `scripts/fetch-scores.js`, `test/fetch.test.js`

- [ ] **Step 1: Write failing normaliser test**

`test/fetch.test.js`:
```js
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
```

- [ ] **Step 2: Run, confirm failure**
Run: `npm test`  Expected: FAIL (cannot find `../scripts/fetch-scores.js`)

- [ ] **Step 3: Implement fetch script**

`scripts/fetch-scores.js`:
```js
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const API_URL = 'https://api.football-data.org/v4/competitions/WC/matches';

export function normalise(apiData) {
  const team = (t) => ({
    code: t?.tla || null,
    name: t?.name || 'TBD',
    crest: t?.crest || '',
  });
  return {
    lastUpdated: new Date().toISOString(),
    matches: (apiData.matches || []).map((m) => ({
      id: m.id,
      stage: m.stage,
      group: m.group || null,
      utcDate: m.utcDate,
      status: m.status,
      home: team(m.homeTeam),
      away: team(m.awayTeam),
      homeScore: m.score?.fullTime?.home ?? null,
      awayScore: m.score?.fullTime?.away ?? null,
      decidedBy:
        m.score?.duration === 'PENALTY_SHOOTOUT' ? 'PENALTIES'
        : m.score?.duration === 'EXTRA_TIME' ? 'EXTRA_TIME'
        : 'REGULAR',
      winner: m.score?.winner || null,
    })),
  };
}

async function main() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    console.error('FOOTBALL_DATA_TOKEN is not set');
    process.exit(1);
  }
  const res = await fetch(API_URL, { headers: { 'X-Auth-Token': token } });
  if (!res.ok) {
    console.error(`football-data.org returned ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const data = await res.json();
  const out = normalise(data);
  const target = new URL('../data/matches.json', import.meta.url);
  writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${out.matches.length} matches`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
```

- [ ] **Step 4: Run tests**
Run: `npm test`  Expected: all PASS

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat: football-data fetch script with normaliser"
```

### Task 5: Frontend page

**Files:**
- Create: `index.html`, `assets/style.css`, `assets/app.js`

- [ ] **Step 1: Write index.html**

```html
<!DOCTYPE html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TFC World Cup Sweep 2026</title>
  <link rel="stylesheet" href="assets/style.css">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='80' font-size='80'>&#9917;</text></svg>">
</head>
<body>
  <header>
    <h1>&#9917; TFC World Cup Sweep</h1>
    <p id="updated" class="updated">Loading scores...</p>
  </header>
  <main>
    <section id="leader-hero" class="hidden"></section>
    <section>
      <h2>Leaderboard</h2>
      <div id="leaderboard"></div>
    </section>
    <section>
      <h2>Today</h2>
      <div id="today" class="match-list"></div>
    </section>
    <section>
      <h2>Latest results</h2>
      <div id="latest" class="match-list"></div>
    </section>
  </main>
  <footer>
    <p>Win 3 &middot; Draw 1 &middot; Loss 0 (shootouts count as draws, FIFA style). Both teams combined. Tiebreak: goal difference, then goals.</p>
  </footer>
  <script type="module" src="assets/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write assets/app.js**

```js
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
  const leaders = board.filter((p) => p.tied && p.points === board[0].points
    && p.gd === board[0].gd && p.gf === board[0].gf);
  const names = (leaders.length ? leaders : [board[0]]).map((p) => p.name);
  hero.classList.remove('hidden');
  hero.append(el('div', 'crown', '\u{1F451}'));
  hero.append(el('div', 'leader-name', names.join(' & ')));
  hero.append(el('div', 'leader-sub',
    names.length > 1 ? `tied on ${board[0].points} pts` : `leading with ${board[0].points} pts`));
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
  const stage = match.group || STAGE_LABELS[match.stage] || match.stage;
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
```

- [ ] **Step 3: Write assets/style.css**

```css
:root {
  --pitch: #0b3d2e;
  --pitch-deep: #072a1f;
  --line: rgba(255, 255, 255, 0.14);
  --ink: #f4f7f5;
  --ink-dim: rgba(244, 247, 245, 0.65);
  --gold: #f2c14e;
  --live: #ff5d5d;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
  background: linear-gradient(180deg, var(--pitch) 0%, var(--pitch-deep) 100%);
  min-height: 100vh;
  color: var(--ink);
}
header { text-align: center; padding: 2.2rem 1rem 0.5rem; }
h1 { margin: 0; font-size: 1.9rem; letter-spacing: 0.02em; }
.updated { color: var(--ink-dim); font-size: 0.85rem; }
main { max-width: 880px; margin: 0 auto; padding: 0 1rem 3rem; }
h2 {
  font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.14em;
  color: var(--gold); border-bottom: 1px solid var(--line);
  padding-bottom: 0.4rem; margin-top: 2.2rem;
}
.hidden { display: none; }
#leader-hero {
  text-align: center; margin-top: 1.4rem; padding: 1.2rem;
  background: rgba(242, 193, 78, 0.1); border: 1px solid rgba(242, 193, 78, 0.35);
  border-radius: 14px;
}
.crown { font-size: 2rem; }
.leader-name { font-size: 1.5rem; font-weight: 700; }
.leader-sub { color: var(--ink-dim); }
table { width: 100%; border-collapse: collapse; }
th {
  text-align: left; font-size: 0.7rem; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--ink-dim); padding: 0.5rem 0.5rem;
}
td { padding: 0.55rem 0.5rem; border-top: 1px solid var(--line); vertical-align: middle; }
tr.top td { background: rgba(242, 193, 78, 0.07); }
.rank { color: var(--ink-dim); width: 2rem; }
.name { font-weight: 600; white-space: nowrap; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.pts { font-weight: 700; color: var(--gold); }
.teams { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.chip {
  display: inline-flex; align-items: center; gap: 0.35rem;
  background: rgba(255, 255, 255, 0.07); border-radius: 999px;
  padding: 0.15rem 0.6rem 0.15rem 0.3rem; font-size: 0.82rem;
}
.chip.out { opacity: 0.55; }
.crest { width: 18px; height: 18px; object-fit: contain; }
.chip-pts { color: var(--gold); font-weight: 700; }
.badge {
  font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em;
  background: rgba(255, 255, 255, 0.12); border-radius: 999px; padding: 0.05rem 0.4rem;
}
.badge.gold { background: var(--gold); color: #2b2103; font-weight: 700; }
.badge.warn { background: var(--live); color: #fff; }
.match-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.6rem; }
.match {
  border: 1px solid var(--line); border-radius: 10px; padding: 0.6rem 0.8rem;
  background: rgba(255, 255, 255, 0.04);
}
.match-stage { font-size: 0.7rem; text-transform: uppercase; color: var(--ink-dim); letter-spacing: 0.08em; }
.match-line { display: flex; justify-content: space-between; gap: 0.5rem; margin-top: 0.25rem; }
.team { flex: 1; }
.team.away { text-align: right; }
.score { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.match-meta { font-size: 0.72rem; color: var(--ink-dim); margin-top: 0.2rem; }
.match-meta.live { color: var(--live); font-weight: 700; }
.empty { color: var(--ink-dim); }
footer { text-align: center; color: var(--ink-dim); font-size: 0.75rem; padding: 1rem; }
```

- [ ] **Step 4: Verify locally with fixture data**

Temporarily copy a fixture into `data/matches.json` (a few FINISHED group matches using roster team codes), run `python3 -m http.server 8123`, open `http://localhost:8123`, confirm leaderboard ranks correctly and matches render. Restore the seed file afterwards (or keep the fixture until first real fetch replaces it).

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat: dashboard page"
```

### Task 6: Scheduled GitHub Action

**Files:**
- Create: `.github/workflows/update-scores.yml`

- [ ] **Step 1: Write workflow**

```yaml
name: Update scores
on:
  schedule:
    - cron: '17 */2 * * *'
  workflow_dispatch:
permissions:
  contents: write
jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Fetch scores
        run: node scripts/fetch-scores.js
        env:
          FOOTBALL_DATA_TOKEN: ${{ secrets.FOOTBALL_DATA_TOKEN }}
      - name: Commit if changed
        run: |
          git config user.name "wc-sweep-bot"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/matches.json
          git diff --cached --quiet && echo "No changes" && exit 0
          git commit -m "Update scores"
          git push
```

- [ ] **Step 2: Commit**
```bash
git add -A && git commit -m "ci: scheduled score updates"
```

### Task 7: Publish to GitHub and enable Pages

- [ ] **Step 1: Create repo and push**
```bash
gh repo create wc-sweep-dashboard --public --source . --push
```

- [ ] **Step 2: Enable Pages from main root**
```bash
gh api -X POST repos/{owner}/wc-sweep-dashboard/pages \
  -f 'source[branch]=main' -f 'source[path]=/'
```
Expected: 201. Then confirm the URL with `gh api repos/{owner}/wc-sweep-dashboard/pages -q .html_url`.

- [ ] **Step 3: Hand back to Ricky**
Remaining manual steps (cannot be done without his accounts):
- Sign up at football-data.org, add `FOOTBALL_DATA_TOKEN` repo secret
  (`gh secret set FOOTBALL_DATA_TOKEN`)
- Replace placeholder names/teams in `data/roster.json`
- Run the workflow once: `gh workflow run update-scores.yml`

### Task 8: Vault bookkeeping

**Files:**
- Create: `~/Documents/second_brain/05-projects/wc-sweep-dashboard.md`
- Modify: `~/Documents/second_brain/01-daily/2026-06-12.md`, `~/Documents/second_brain/tasks/todo.md`

- [ ] **Step 1: Project note** with required frontmatter (`type: project`, `status: active`, `created/updated: 2026-06-12`), linking repo path, Pages URL, scoring rules summary, and the outstanding manual steps.

- [ ] **Step 2: Daily note highlight** describing the build.

- [ ] **Step 3: todo.md review section** marking the plan items complete.

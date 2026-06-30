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

export function matchPoints(match) {
  if (match.status !== 'FINISHED') return null;
  const isDraw = match.decidedBy === 'PENALTIES' || match.homeScore === match.awayScore;
  if (isDraw) return { home: 1, away: 1 };
  return match.homeScore > match.awayScore ? { home: 3, away: 0 } : { home: 0, away: 3 };
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
    const pts = matchPoints(match);
    home.points += pts.home; away.points += pts.away;
    if (pts.home === pts.away) { home.drawn++; away.drawn++; }
    else if (pts.home === 3) { home.won++; away.lost++; }
    else { away.won++; home.lost++; }
  }
  for (const team of teams.values()) team.gd = team.gf - team.ga;
  applyEliminations(teams, matches);
  return teams;
}

// Group-only mini-table (codes ranked by pts, GD, GF) so eliminations don't
// borrow points a team earned in the knockouts.
function groupRank(groupMatches) {
  const rows = new Map();
  const ensure = (t) => {
    if (!t?.code) return null;
    if (!rows.has(t.code)) rows.set(t.code, { code: t.code, points: 0, gf: 0, ga: 0 });
    return rows.get(t.code);
  };
  for (const m of groupMatches) { ensure(m.home); ensure(m.away); }
  for (const m of groupMatches) {
    if (m.status !== 'FINISHED' || m.homeScore == null || m.awayScore == null) continue;
    const h = ensure(m.home), a = ensure(m.away);
    if (!h || !a) continue;
    h.gf += m.homeScore; h.ga += m.awayScore;
    a.gf += m.awayScore; a.ga += m.homeScore;
    const pts = matchPoints(m);
    h.points += pts.home; a.points += pts.away;
  }
  const list = [...rows.values()];
  list.forEach((r) => { r.gd = r.gf - r.ga; });
  list.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.code.localeCompare(b.code));
  return list;
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
  // Group-stage exits resolved per group, not gated on the whole world's groups
  // finishing. 4th place (and below) is out the moment its own group completes;
  // 3rd place only once every group is done and it misses the best-eight cut.
  const groupKeys = [...new Set(
    matches.filter((m) => m.stage === 'GROUP_STAGE' && m.group).map((m) => m.group)
  )];
  const groupInfo = groupKeys.map((key) => {
    const gm = matches.filter((m) => m.group === key);
    return {
      finished: gm.length > 0 && gm.every((m) => m.status === 'FINISHED'),
      table: groupRank(gm),
    };
  });
  const allGroupsDone = groupInfo.length > 0 && groupInfo.every((g) => g.finished);
  const thirds = groupInfo.filter((g) => g.finished).map((g) => g.table[2]).filter(Boolean)
    .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.code.localeCompare(b.code));
  const bestThirds = new Set(thirds.slice(0, 8).map((t) => t.code));
  for (const g of groupInfo) {
    if (!g.finished) continue;
    g.table.forEach((row, i) => {
      const rank = i + 1;
      const team = teams.get(row.code);
      if (!team || team.exitStage) return;
      if (rank >= 4) team.exitStage = 'GROUP_STAGE';
      else if (rank === 3 && allGroupsDone && !bestThirds.has(row.code)) team.exitStage = 'GROUP_STAGE';
    });
  }
}

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

export function teamMatches(matches, code) {
  return matches
    .filter((m) => m.home?.code === code || m.away?.code === code)
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
    .map((match) => {
      const isHome = match.home?.code === code;
      let outcome = null;
      let pensProgressed = null;
      if (match.status === 'FINISHED') {
        if (match.decidedBy === 'PENALTIES' || match.homeScore === match.awayScore) {
          outcome = 'D';
        } else {
          const homeWon = match.homeScore > match.awayScore;
          outcome = homeWon === isHome ? 'W' : 'L';
        }
        if (match.decidedBy === 'PENALTIES' && match.winner && match.winner !== 'DRAW') {
          pensProgressed = (match.winner === 'HOME_TEAM') === isHome;
        }
      }
      return { match, isHome, outcome, pensProgressed };
    });
}

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

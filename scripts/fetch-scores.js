import { writeFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const API_URL = 'https://api.football-data.org/v4/competitions/WC/matches';

// Self-hosted crests (see fetch-crests.js): the football-data CDN
// rate-limits bursts, so prefer the local copy when one exists.
const localCrests = (() => {
  try {
    const files = readdirSync(new URL('../assets/crests/', import.meta.url));
    return new Map(files.map((f) => [f.split('.')[0], `assets/crests/${f}`]));
  } catch {
    return new Map();
  }
})();

export function normalise(apiData) {
  const team = (t) => ({
    code: t?.tla || null,
    name: t?.name || 'TBD',
    crest: localCrests.get(t?.tla) || t?.crest || '',
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

// football-data.org occasionally drops the TLS connection mid-request
// (UND_ERR_SOCKET, "other side closed"). Retry with backoff so a single
// transient socket drop doesn't fail the whole run.
async function fetchWithRetry(url, opts, attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error(`returned ${res.status} ${res.statusText}`);
      return res;
    } catch (err) {
      if (i === attempts) throw err;
      const wait = 2 ** i * 1000; // 2s, 4s, 8s
      console.warn(`fetch attempt ${i} failed (${err.message}), retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function main() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    console.error('FOOTBALL_DATA_TOKEN is not set');
    process.exit(1);
  }
  const res = await fetchWithRetry(API_URL, { headers: { 'X-Auth-Token': token } });
  const data = await res.json();
  const out = normalise(data);
  const target = new URL('../data/matches.json', import.meta.url);
  writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${out.matches.length} matches`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Polymarket "FIFA World Cup" games series (slug: soccer-fifwc). Each game has a
// main 3-way moneyline event (slug fifwc-<home>-<away>-<date>) holding three
// Yes/No markets: home win, away win, draw. The Yes price is the implied
// probability of that outcome at 90 minutes.
const SERIES_ID = '11433';
const BASE = 'https://gamma-api.polymarket.com';
const PAGE = 100;
const GAME_SLUG = /^fifwc-[a-z0-9]+-[a-z0-9]+-\d{4}-\d{2}-\d{2}$/;

// football-data.org name -> Polymarket name (both normalised) where spelling
// genuinely differs. Never match on team codes: Polymarket's "kor" is Curaçao
// while Korea Republic is "kr".
const ALIASES = new Map([
  ['ivorycoast', 'cotedivoire'],
  ['congodr', 'drcongo'],
  ['capeverdeislands', 'caboverde'],
  ['iran', 'iriran'],
  ['southkorea', 'korearepublic'],
  ['turkey', 'turkiye'],
]);

export function normaliseName(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\band\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

export function namesMatch(fdName, pmName) {
  const a = normaliseName(fdName);
  const b = normaliseName(pmName);
  return a === b || ALIASES.get(a) === b;
}

export function extractGame(event) {
  if (!GAME_SLUG.test(event.slug || '')) return null;
  const teams = event.teams || [];
  const home = teams.find((t) => t.ordering === 'home');
  const away = teams.find((t) => t.ordering === 'away');
  if (!home || !away || !Array.isArray(event.markets)) return null;
  const probs = {};
  for (const m of event.markets) {
    const prices = typeof m.outcomePrices === 'string'
      ? JSON.parse(m.outcomePrices)
      : m.outcomePrices;
    const yes = Number(prices?.[0]);
    if (!Number.isFinite(yes)) continue;
    const suffix = (m.slug || '').slice(event.slug.length + 1);
    if (suffix === 'draw') probs.draw = yes;
    else if (suffix === home.abbreviation) probs.home = yes;
    else if (suffix === away.abbreviation) probs.away = yes;
  }
  if (probs.home === undefined || probs.draw === undefined || probs.away === undefined) return null;
  const total = probs.home + probs.draw + probs.away;
  if (total <= 0) return null;
  return {
    slug: event.slug,
    startTime: event.startTime,
    homeName: home.name,
    awayName: away.name,
    home: probs.home / total,
    draw: probs.draw / total,
    away: probs.away / total,
  };
}

const round3 = (n) => Math.round(n * 1000) / 1000;

export function buildPredictions(matches, events) {
  const games = events.map(extractGame).filter(Boolean);
  const predictions = {};
  const unmatched = [];
  for (const match of matches) {
    if (match.status !== 'TIMED' && match.status !== 'SCHEDULED') continue;
    if (!match.home.code || !match.away.code) continue; // TBD knockout slots
    const kickoff = Date.parse(match.utcDate);
    const candidates = games.filter((g) => Date.parse(g.startTime) === kickoff);
    const scored = candidates
      .map((g) => ({
        g,
        score: (namesMatch(match.home.name, g.homeName) ? 1 : 0)
          + (namesMatch(match.away.name, g.awayName) ? 1 : 0),
      }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    // Group-stage final rounds kick off simultaneously: with more than one
    // candidate at the same time, both team names must agree.
    const needed = candidates.length > 1 ? 2 : 1;
    if (best && best.score >= needed) {
      predictions[match.id] = {
        home: round3(best.g.home),
        draw: round3(best.g.draw),
        away: round3(best.g.away),
        slug: best.g.slug,
      };
    } else {
      unmatched.push(`${match.home.name} v ${match.away.name} @ ${match.utcDate}`);
    }
  }
  return { predictions, unmatched };
}

async function fetchJson(url) {
  // GAMMA_PROXY: optional text-relay prefix (e.g. https://r.jina.ai/) for local
  // dev. Polymarket is ISP-blocked in Australia; GitHub runners reach it directly.
  const proxy = process.env.GAMMA_PROXY || '';
  const res = await fetch(proxy + url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const text = await res.text();
  const start = text.indexOf('[');
  if (start === -1) throw new Error(`${url}: no JSON array in response`);
  return JSON.parse(text.slice(start));
}

async function fetchSeriesEvents() {
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await fetchJson(
      `${BASE}/events?series_id=${SERIES_ID}&closed=false&limit=${PAGE}&offset=${offset}`,
    );
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
}

async function main() {
  const matchesPath = new URL('../data/matches.json', import.meta.url);
  const { matches } = JSON.parse(readFileSync(matchesPath, 'utf8'));
  const events = await fetchSeriesEvents();
  const { predictions, unmatched } = buildPredictions(matches, events);
  const out = {
    lastUpdated: new Date().toISOString(),
    source: 'Polymarket',
    predictions,
  };
  const target = new URL('../data/predictions.json', import.meta.url);
  writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote predictions for ${Object.keys(predictions).length} upcoming matches`);
  for (const u of unmatched) console.log(`No Polymarket market matched: ${u}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

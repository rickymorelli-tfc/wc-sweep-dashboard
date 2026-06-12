import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// One-time: self-host team crests. crests.football-data.org rate-limits
// bursts, so hotlinking ~100 images breaks a random subset on each load.
async function main() {
  const { matches } = JSON.parse(readFileSync(new URL('../data/matches.json', import.meta.url), 'utf8'));
  const dir = new URL('../assets/crests/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const seen = new Map();
  for (const m of matches) {
    for (const t of [m.home, m.away]) {
      if (t.code && t.crest && t.crest.startsWith('http')) seen.set(t.code, t.crest);
    }
  }
  let ok = 0;
  for (const [code, url] of seen) {
    const ext = url.split('.').pop();
    const target = new URL(`${code}.${ext}`, dir);
    if (existsSync(target)) { ok += 1; continue; }
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`${code}: HTTP ${res.status} for ${url}`);
      continue;
    }
    writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    ok += 1;
  }
  console.log(`Crests on disk: ${ok}/${seen.size}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

# TFC World Cup 2026 Sweep Dashboard: Design Spec

Date: 2026-06-12
Status: Approved by Ricky 2026-06-12

## Purpose

A fun office-sweep dashboard for the 2026 FIFA World Cup. Each TFC person was
assigned two teams (one from the top half of the draw, one from the bottom
half). The dashboard keeps match scores up to date and shows who is overall
winning the sweep.

## Scoring rules (FIFA-style, whole tournament)

- Every match a team plays: win = 3 points, draw = 1, loss = 0.
- A match decided by penalty shootout counts as a draw for both teams
  (matching FIFA's tournament-ranking convention). Extra-time wins count as
  wins.
- A person's score is the sum of their two teams' points.
- Tiebreakers between people: combined goal difference, then combined goals
  scored, then alphabetical (display only, flagged as tied).
- Deeper tournament runs naturally score more because the team plays more
  matches. No separate knockout mechanic.
- Knocked-out teams stay on the board, greyed, with their exit round shown.

## Architecture

Static site on GitHub Pages, data baked in by a scheduled GitHub Action.
No backend, no client-side API calls, no exposed credentials.

```
football-data.org (WC competition, free tier)
        |  scheduled GitHub Action (every 2h during tournament)
        v
data/matches.json  (committed to repo when changed)
        +
data/roster.json   (hand-edited: person -> two team codes)
        |
        v
index.html + assets/app.js + assets/style.css  (pure client-side render)
        |
        v
GitHub Pages (public URL)
```

## Components

- `data/roster.json`: list of `{ name, teams: [FIFA code, FIFA code] }`.
  First names only; the page is public.
- `data/matches.json`: normalised match list written by the fetcher:
  `{ lastUpdated, matches: [{ id, stage, group, utcDate, status, home, away,
  homeScore, awayScore, decidedBy }] }` where `decidedBy` is
  `REGULAR | EXTRA_TIME | PENALTIES`.
- `scripts/fetch-scores.js`: Node script (no deps) calling
  `https://api.football-data.org/v4/competitions/WC/matches` with
  `X-Auth-Token` from env `FOOTBALL_DATA_TOKEN`. Normalises the response into
  `matches.json`. On API failure: exits non-zero without touching the last
  good file.
- `assets/score.js`: pure scoring module (works in browser and Node).
  Takes matches plus roster, returns team tables and the person leaderboard
  with tiebreakers applied. Unit-tested.
- `assets/app.js`: fetches the two JSON files, renders leaderboard, latest
  results, today's fixtures, last-updated stamp.
- `index.html`, `assets/style.css`: the page. Leader gets a crown callout.
- `.github/workflows/update-scores.yml`: cron `17 */2 * * *` plus
  `workflow_dispatch`; runs fetcher, commits `data/matches.json` if changed.
- `test/score.test.js`: Node built-in test runner, fixture-driven.

## Error handling

- Fetch failure: Action fails visibly, last good data stays deployed.
- Page always shows `lastUpdated` so staleness is obvious.
- Manual override: edit `data/matches.json` by hand and push; the fetcher
  rewrites it on next successful run, so persistent corrections belong
  upstream (rare).
- Roster team code not found in match data: rendered with 0 points and a
  visible "unknown team code" badge rather than crashing.

## Out of scope (YAGNI)

- Authentication, admin UI, predictions/tipping, notifications, historical
  tournaments, golden-boot stats.

## Operational notes

- Repo: `~/Documents/wc-sweep-dashboard/`, pushed to GitHub
  (rickymorelli-tfc), Pages serving from `main` root.
- Secret: `FOOTBALL_DATA_TOKEN` repo secret (free key from football-data.org;
  Ricky signs up).
- Vault gets a project note `05-projects/wc-sweep-dashboard.md` linking here.
- The Pages URL is public and unauthenticated. Roster uses first names only.

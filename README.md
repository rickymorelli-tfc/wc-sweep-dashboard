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

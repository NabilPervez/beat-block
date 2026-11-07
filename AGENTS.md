# BEAT//BLOCK — agent notes

Lumines-style endless rhythm puzzle game. Spec: `docs/PRD.html` (v1), `docs/PRD-v2.md` (v2). Plan: `docs/SPRINT_PLAN_V2.md`.

## Stack
Vite + TypeScript, no UI framework (PRD suggests React; the UI is a handful of overlays, so plain DOM keeps the bundle tiny). Canvas 2D board. Vitest for engine tests. Deployed to Netlify from `dist/`.

## Layout
- `src/engine/` — framework-free simulation. Never import DOM here.
  - `pieces.ts` shapes + rotation, `rng.ts` seedable RNG, `game.ts` state machine, sweep, scoring.
- `src/render.ts` — draws state; never decides rules.
- `src/input.ts` — keyboard/touch → `GameCommand`.
- `src/storage.ts` — IndexedDB profile, versioned, with migration.
- `src/main.ts` — wires UI, loop, storage, share, audio.
- `src/beat.ts` — the one beat clock (audio time, `performance.now()` fallback). Music schedules from it; S2 stamps hard drops against it. Engine never imports it: `onBeat` is passed in.
- `src/themes.ts` — skins (palette + background scene + tempo + bassline). `SKIN_EVERY` squares advance a run to the next skin.
- `src/tutorial.ts` — scripted first-run lesson on a preset board (seed 7). `tests/skins.test.ts` proves it's solvable.
- `public/sw.js` — cache-first service worker. Bump `VERSION` when changing caching.

## Gotchas
- Don't edit source with PowerShell 5.1 `Get-Content`/`Set-Content`: it reads UTF-8 as ANSI and garbles `×`, `—`, `←`. Use the editor tools.
- `VITE_QA=1 npx vite build` exposes `window.__bb` for browser QA (jump `squaresCleared`, call `checkSkin`). Normal builds strip it.

## Daily Drop
- Seed = `seedForDate(localDateKey())` (FNV-1a, local date by design). Start skin = `dailyStartSkin(seed)`.
- Daily results go to `profile.daily` only; Endless records never change from a Daily run.
- Profile schema is v2 (PRD-v2 calls it "v3"; the code was on v1).

## Beat-timed drops (S2)
- `main.ts` stamps `HARD_DROP` with `onBeat` from `beat.onBeat(window, settings.audioOffsetMs)`; tutorial drops are unstamped. Engine never reads the clock.
- `Game.beatMult` (×1.0→×2.0, +0.1/on-beat drop, off-beat resets); clear points = min(×6, combo × beat). Tuning in `CONFIG.beatStep/beatMax/totalMultMax`.
- Unstamped `HARD_DROP` (tests, replays) skips beat scoring entirely, so seeded replays are unchanged.
- Calibration: `calibrationOffset()` in `beat.ts` = median tap error over 8 clicks at 100 BPM, ±300 ms clamp. Positive = player taps late.

## Rules that must not regress
- Piece type = `TYPES[floor(rng()*7)]`. No bag, no anti-repeat.
- No CSS or canvas gradients anywhere.
- Rendering must never consume RNG.
- Board stays 10×16 at every size.

## Commands
`npm run dev` · `npm test` · `npm run build` · deploy: `npx netlify-cli deploy --prod --dir dist`

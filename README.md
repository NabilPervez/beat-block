# BEAT//BLOCK

A Lumines-inspired endless rhythm block puzzle for the browser. Stack the seven tetrominoes, build same-colour 2×2 squares, and a sweep line timed to the music clears them. It installs as a PWA, works offline, and keeps all records on your device. There are no accounts and no backend.

## Features

- **Endless mode** on a 10×16 board with combo scoring and a sweep line that moves with the beat.
- **Six skins**: Rave, Acid, Sunset Bass, Laser, Deep House and Vapor. Each one has its own palette, background scene, tempo (100–128 BPM) and synth bassline. Every 12 squares cleared moves the run to the next skin.
- **Daily Drop**: one seeded run per day, built from the local date. Everyone gets the same pieces and the same starting skin. Retries are unlimited. The day's best score and your streak are tracked separately from Endless, and you can share a text result.
- **Beat-timed drops**: a hard drop on the beat builds a multiplier from ×1.0 up to ×2.0. An off-beat drop resets it. It stacks with the combo multiplier, and the total is capped at ×6. Settings include an audio-latency calibration and a wider timing window for accessibility.
- **First-run tutorial**: a scripted lesson on a preset board.
- **Sharing** through the native share sheet, SMS, WhatsApp or the clipboard.

Planned for v2 but not built yet: special blocks (Bomb, Chain, Wild) and per-skin sweep modifiers. See [docs/PRD-v2.md](docs/PRD-v2.md).

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Move | ← / → or A / D | Pad, or swipe |
| Soft drop | ↓ or S | Pad |
| Rotate | ↑, W or X (Z rotates back) | Tap the board |
| Hard drop | Space | Flick down |
| Pause | Esc or P | Pad |
| Restart | Enter | — |

## Getting started

You need Node 18 or newer.

```bash
npm install
npm run dev       # Vite dev server
npm test          # Vitest: engine, skins, tutorial, v2 sprint tests
npm run build     # icons + typecheck + production build to dist/
npm run preview   # serve the built dist/
```

## Tech stack

- **Vite and TypeScript** with no UI framework. The UI is a handful of overlays, so plain DOM keeps the bundle small.
- **Canvas 2D** for the board, and the **Web Audio API** for the music and the beat clock.
- **IndexedDB** for the profile. The schema is versioned (currently v2) and includes migration.
- A **service worker** (`public/sw.js`) that caches first, so the game runs offline.
- **Vitest** for tests and **Netlify** for hosting.

## Project structure

```
src/
  engine/        framework-free simulation (never touches the DOM)
    game.ts      state machine, gravity, sweep, scoring, beat multiplier
    pieces.ts    tetromino shapes and rotation
    rng.ts       seedable RNG (daily seeds)
  main.ts        wires UI, game loop, storage, audio and sharing
  render.ts      draws state; never decides rules
  input.ts       keyboard and touch → GameCommand
  beat.ts        the single beat clock, on-beat checks, calibration
  audio.ts       synth music and sound effects
  themes.ts      skins and skin progression
  tutorial.ts    first-run lesson
  storage.ts     IndexedDB profile
  share.ts       share text and links
public/          manifest, service worker
scripts/         icon generation
tests/           Vitest suites
docs/            PRDs and sprint plans
```

## Design rules

These rules must not regress. [AGENTS.md](AGENTS.md) has the full list.

- Each piece is chosen uniformly at random from the seven types. There is no bag and no anti-repeat.
- Rendering never consumes RNG, so seeded runs replay exactly.
- The engine never reads the clock. Beat timing is stamped on the command in `main.ts`.
- The board stays 10×16 at every screen size.
- No CSS or canvas gradients anywhere.

## Deploy

Netlify builds the site with `npm run build` and publishes `dist/` (see `netlify.toml`). To deploy by hand:

```bash
npx netlify-cli deploy --prod --dir dist
```

If you change caching behaviour, bump `VERSION` in `public/sw.js`.

## Docs

- [docs/PRD.html](docs/PRD.html): v1 spec (shipped)
- [docs/PRD-v2.md](docs/PRD-v2.md): v2 spec (Daily Drop, beat drops, special blocks, skin modifiers)
- [docs/SPRINT_PLAN_V2.md](docs/SPRINT_PLAN_V2.md): current sprint plan
- [AGENTS.md](AGENTS.md): notes for AI agents and contributors

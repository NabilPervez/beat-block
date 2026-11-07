# BEAT//BLOCK v2 — Sprint plan

Source: [`PRD-v2.md`](PRD-v2.md) §14. Points are estimates (1 pt ≈ half a focused session).

## Sprint 1 — Beat clock, schema, Daily Drop live

**Goal:** Daily Drop is playable from Home with a date seed, and one beat clock drives music timing.

| # | Item | IDs | Pts (est.) |
|---|---|---|---|
| 1 | `seedForDate()` (FNV-1a 32-bit over local `yyyy-mm-dd`) + `localDateKey()` | DAILY-01, TR-01 | 1 |
| 2 | Profile schema → next version: `daily {date, best, timeMs, streak, lastPlayed}`, `settings.beatWindow`, `audioOffsetMs`, `classicSweep`; migration keeps every record | DAILY-02, TR-02 | 2 |
| 3 | Daily start skin from the seed | DAILY-04, TR-04 | 1 |
| 4 | `src/beat.ts` clock: audio time when available, `performance.now()` fallback; pause-aware; `isOnBeat(t, windowMs, offsetMs)` | BEAT-01, TR-05 | 3 |
| 5 | Music scheduled from the clock (replaces frame-delta `beatAcc`) | TR-05 | 1 |
| 6 | Home: Daily card enabled, mode selection, today's best shown; Game Over shows Daily best | DAILY-02 | 2 |
| 7 | Latency spike tooling: QA build logs beat vs `AudioContext.currentTime` drift | Risk #1 | 1 |

**Carried by design:** streak counter UI and Daily share text (S4); unlimited retries is the default behaviour.

**Device spike (needs Nabil):** run the QA build on 3 devices (iPhone, Android, desktop + Bluetooth) and report drift; Claude can't touch real hardware.

## Definition of Done (S1)

- `npm test` and `npm run build` pass, zero new errors or warnings
- Unit tests: same date → same 100 pieces; different dates differ; old-profile migration keeps records; on-beat window math; Daily skin deterministic
- Seeded Endless replay unchanged (1/7 RNG rule intact)
- Daily card runs in a browser, evidenced by screenshot
- No hard-coded tuning: beat window/offset defaults in `CONFIG`/settings
- AGENTS.md updated; pushed to `main`; Change Log row in Notion

## Sprint 2 — Beat-timed drops, multiplier, pulse, calibration

**Goal:** hard drops on the beat build a multiplier the player can see, hear and tune.

| # | Item | IDs | Pts (est.) | Status |
|---|---|---|---|---|
| 1 | `HARD_DROP { onBeat }`; `beatMult`/`beatStreak` in `Game`; combo × beat capped ×6 | BEAT-02, TR-06 | 2 | Done |
| 2 | Input stamps hard drops against the beat clock + audio offset + window setting | BEAT-01, TR-06 | 1 | Done |
| 3 | Frame + Next-box pulse, "ON BEAT ×n" pop, on-beat tick sfx; colour-only under Reduced motion | BEAT-03, 04, TR-07 | 2 | Done |
| 4 | "Wider beat window" setting (±150 ms) | BEAT-04 | 0.5 | Done |
| 5 | Calibration sheet: 8 clicks, median offset, reset | BEAT-05, TR-08 | 2 | Done |
| 6 | Game Over shows on-beat drops (feeds the ≥30% metric) | metric | 0.5 | Done |

**Needs Nabil:** Playtest 1 (PRD §14 exit criterion) and the S1 device drift spike. Window ±90 ms and +0.1 step are estimates to tune there.

## Definition of Done (S2)

- `npm test` + `npm run build` pass, no new warnings — **met** (42 tests, 18.0 kB gzip JS vs 55 kB budget)
- Unit tests: multiplier build/cap/reset, soft/gravity locks ignored, ×6 total cap, seeded no-regression, calibration math — **met**
- Browser evidence: on-beat run (4/4, ×1.4) and calibration (+70 ms taps → +71 ms saved) — **met**
- No hard-coded tuning; touch + keyboard — **met** (`CONFIG`, `BEAT_CONFIG`; calibration takes tap or Space)
- Min-spec phone frame budget — **not verified** (no device access)
- AGENTS.md updated; pushed to `main`; Change Log row in Notion

## Sprints 3–4

See PRD-v2 §14. Planned in detail at the start of each sprint.

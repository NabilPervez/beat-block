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

## Sprints 2–4

See PRD-v2 §14. Planned in detail at the start of each sprint.

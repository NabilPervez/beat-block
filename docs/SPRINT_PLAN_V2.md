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

## Sprint 3 — Silent-first beat (mobile feedback)

**Goal:** the beat multiplier is fully playable muted. The beat is something you *see* (and on Android, *feel*); sound is a bonus.
**Source:** playtest feedback from Jason (2026-11-07). Most mobile players play muted, and S2's multiplier is audio-gated.

**Cue hierarchy.** This is a deliberate deviation from the feedback, which treats all cues equally. Firing them all at full strength is noise that fights the falling piece for attention.
- **Primary:** a pulse ring on the falling piece. It sits where the eyes already are.
- **Secondary:** the beat strip, for anticipation.
- **Ambient:** the frame pulse (already shipped in S2). It only gets louder in Silent mode.

| # | Item | Pts (est.) | Notes |
|---|---|---|---|
| 1 | `beatPhase()` on `BeatClock`: 0→1 phase, beat index, bar position, offset-aware. Every cue reads only this. | 1 | Render-only. The engine stays clock-free. |
| 2 | **Pulse ring.** A ring around the active piece shrinks from 1.8× to 1.0× and closes exactly on the beat. It turns gold inside the PERFECT window. | 2 | Canvas strokes, no gradients (AGENTS rule). |
| 3 | **Beat strip** under the board. Ticks slide into a fixed "now" marker, with a bigger tick on beat 1 of each bar. | 1.5 | One tap-free strip, 10-col width. |
| 4 | **Judgement tiers.** PERFECT (≤ ±45 ms) / GOOD (≤ window) / OFF-BEAT pop-ups replace the "ON BEAT ×n" pop. GOOD scores the S2 step; PERFECT scores +0.15. | 2 | Needs `HARD_DROP { beatGrade }`. This is an engine change, so add tests. Windows are estimates for Playtest 1. |
| 5 | **Multiplier meter** next to the score. It fills toward ×2.0, and on a streak break it shakes (≈240 ms) and drains. | 1 | Under Reduced motion: no shake, the meter just flashes the colour. |
| 6 | **Sound / Silent choice on first launch.** Silent mode scales the ring, strip and frame pulse up about 1.4× (est.) and increases the frame pulse opacity. Stored in profile settings and changeable later. | 1.5 | Profile schema stays v2 (it's an additive field with a default). |
| 7 | **Haptics hook.** `haptics.tick(strong)` calls `navigator.vibrate` where it's supported (Android) and is a no-op elsewhere. A settings toggle, off in Sound mode by default. | 0.5 | The Capacitor iOS Taptic adapter plugs into the same hook in **Sprint 4** (deferred, Nabil 2026-11-07). |
| 8 | **Motion pass.** Easing and timing per `docs/MOTION_SPEC_S3.md`, plus a full Reduced-motion fallback. | 1 | |

**Stretch, behind a setting, not default:** the sweep line steps one column per beat instead of gliding. ⚠️ The sweep *clears squares*, so stepping changes when clears land, and that's a rules change. It ships as an opt-in "Metronome sweep" until Playtest 1 says otherwise.

**Out of scope:** Capacitor/iOS wrap (S4), new skins, Daily changes.

**Status (2026-11-07): items 1–8 done.** Stretch "Metronome sweep" not built. Deviation: choosing Silent also turns music and sound effects off, and Sound turns beat vibration off, so the choice does what it says; both stay editable in Settings.

## Definition of Done (S3)

Results: 49 tests green (7 new); JS 19.7 kB gzip; browser evidence on a 390×844 touch viewport (gold ring + gold strip tick on the beat, meter ×1.3 after 2 PERFECT drops, first-launch sheet). **Not verified:** the ≥70% muted-tester target and min-spec phone frame timing. Both need Playtest 1 on real devices.

- With sound muted and Silent mode on, a tester who has never played hits **≥70% PERFECT+GOOD** on hard drops after 60 s (est. target, to tune at Playtest 1)
- All cues read `beatPhase()`. Ring close and strip "now" stay within **±1 frame** of the beat at 60 fps (browser evidence: frame-stepped capture)
- Engine tests: grade tiers, PERFECT step, streak break, unstamped drops still skip beat scoring, seeded replays unchanged
- Reduced motion: no scale, no shake, and every cue is still readable by colour or opacity alone
- No gradients; rendering consumes no RNG; board stays 10×16
- `npm test` + `npm run build` green; JS ≤ 25 kB gzip (est. budget, 55 kB hard cap)
- AGENTS.md updated, pushed to `main`, Netlify deploy, Change Log row in Notion

## Sprint 4

Capacitor wrap (iOS + Android), native haptics adapter, TestFlight. **Needs:** Mac + Xcode + Apple Developer account ($99/yr). Then PRD-v2 §14 items.

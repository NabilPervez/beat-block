# Motion spec — Sprint 3 beat cues

All cues are driven by `beatPhase()`. Here `p` runs 0→1 across one beat, and the beat lands at p = 0 (= 1 of the previous beat). Every cue is a pure function of `p`, `bar`, and `grade`. There are no independent timers, so nothing can drift.

| Cue | Motion | Timing | Easing | Silent mode | Reduced motion |
|---|---|---|---|---|---|
| Pulse ring | Scale 1.8× → 1.0× of the piece bounds, stroke 2 → 3 px | Over the whole beat; closes at p = 1 | `easeInQuad` (accelerates into the beat, so the close feels "landed") | Stroke 4 px, opacity 0.9 | No scale. Opacity ramps 0.2 → 1.0 |
| Gold window | Ring stroke becomes `--gold` | While \|t − beat\| ≤ 45 ms | Hard switch (no tween; the snap *is* the signal) | Same | Same |
| Beat strip | Ticks translate right → left into the "now" marker | Linear, 4 beats visible | `linear` (constant speed = readable tempo) | Strip height 1.4× | Ticks don't move; the "now" tick flashes on beat |
| Bar downbeat | Tick height 2× on beat 1 | — | — | Same | Same |
| Frame pulse (S2) | Border opacity 1.0 → 0.35 | 0 → 180 ms after beat | `easeOutCubic` | Peak opacity 1.0, width +2 px | Colour only (S2 behaviour) |
| PERFECT pop | Scale 0.6 → 1.1 → 1.0, rise 12 px, fade out | 0–120 ms in, hold 200 ms, 160 ms out | `easeOutBack` in | Text 1.3× | Fade only |
| GOOD pop | Scale 0.8 → 1.0, fade out | 100 / 160 / 140 ms | `easeOutCubic` | 1.3× | Fade only |
| OFF-BEAT pop | Slide down 6 px, fade out, desaturated | 80 / 120 / 140 ms | `easeOutCubic` | 1.3× | Fade only |
| Meter shake | translateX ±6 → ±3 → 0 px | 240 ms, 3 oscillations | `easeOutQuad` damping | Same | No shake: flash `--danger` 2× |
| Meter drain | Fill → 0 | 300 ms after the shake starts | `easeInCubic` | Same | Instant |
| Haptics | `vibrate(12)` per beat, `vibrate(25)` on beat 1 | On beat | — | Default on (Android) | Unaffected (user toggle) |

Constraints: no gradients (use solid strokes and opacity only). Animate only transform and opacity on DOM overlays. Draw canvas cues in the existing render pass, with no extra rAF.

All durations are estimates to tune at Playtest 1.

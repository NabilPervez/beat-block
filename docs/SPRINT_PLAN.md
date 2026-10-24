# BEAT//BLOCK — Sprint Plan

**Dates:** 2026-10-23 (single build day) | **Team:** 1 engineer (Claude) + Nabil as product owner
**Sprint Goal:** Ship a playable, installable BEAT//BLOCK MVP to Netlify that meets the PRD Definition of Done.

Source of truth: [`docs/PRD.html`](PRD.html). Recommended order from PRD §18 is followed:
gameplay correctness → responsive controls → visual polish → persistence + PWA → sharing → QA.

### Capacity
| Person | Available | Allocation | Notes |
|--------|-----------|------------|-------|
| Claude | 1 session | 40 pts | Planned to ~80% → 32 pts committed, 8 pts buffer |
| Nabil  | review    | —      | Playtest + sign-off on the live URL |

### Sprint Backlog
| Pri | Item (PRD §) | Est | Dependencies |
|-----|--------------|-----|--------------|
| P0 | S1 Engine: 10×16 board, 7 tetrominoes, uniform 1/7 RNG (seedable), move/rotate/kicks, gravity, lock, game over (§3, §10) | 8 | — |
| P0 | S1 Sweep line, 2×2 match detection, component clearing, scoring, combo, difficulty ramp (§4) | 6 | Engine |
| P0 | S1 Vitest unit tests for engine rules (§14.1) | 3 | Engine |
| P0 | S2 Canvas renderer, DPR-aware, ResizeObserver, 2.5D tiles, no gradients (§5, §6.3) | 4 | Engine |
| P0 | S2 Unified input: keyboard with DAS, touch buttons, swipe/tap (§11) | 3 | Engine |
| P0 | S2 Responsive shell: portrait / landscape / desktop, safe areas, dvh (§6) | 3 | Renderer |
| P1 | S3 Screens: home, HUD, pause, game over, settings, records, how-to (§7) | 3 | Shell |
| P1 | S4 IndexedDB profile with schema version + migration, LS fallback (§9) | 2 | — |
| P1 | S4 Manifest + service worker, offline play (§9.4) | 2 | Build |
| P1 | S5 Share: native, SMS, WhatsApp, copy (§8) | 1 | Game over |
| P2 | S5 Procedural audio + haptics (§12) | 2 | — |
| P2 | S5 Themes (4 palettes), symbols, reduced motion, high contrast (§13) | 2 | Renderer |
| P2 | Interactive tutorial (§17 risk) | 3 | Stretch — cut first |
| P2 | Playwright E2E + visual regression (§14.2–14.4) | 4 | Stretch — cut first |

**Planned capacity:** 32 pts | **Committed load:** 31 pts (P0+P1+P2 minus stretch) | **Stretch:** 7 pts

### Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| 2×2 matching too hard with many colours | Unplayable | Pieces use 2 active colours per run (Lumines convention); `COLOR_COUNT` configurable |
| No Netlify CLI / auth on this PC | Can't deploy | Use Netlify MCP or `npx netlify-cli`; fall back to handing over the `dist/` folder |
| Mobile perf | Jank | Integer board, no per-frame allocation, DPR cap 2 |
| PNG icons need an image tool | Install prompt fails | Generate PNGs with a tiny pure-Node encoder at build time |

### Definition of Done (from PRD §18)
- [ ] Only the 7 tetrominoes; uniform independent random selection, no bag
- [ ] Sweep line + colour-square clearing, deterministic, unit-tested
- [ ] Portrait and landscape play without overlap; rotation keeps the run
- [ ] Solid fills only, no gradients
- [ ] Best score, stats and settings persist locally after reload
- [ ] Works offline after first load (service worker)
- [ ] Share message carries real score, time and canonical URL; native share has fallbacks
- [ ] `npm test` and `npm run build` pass
- [ ] Deployed to Netlify over HTTPS

### Key Dates
| Date | Event |
|------|-------|
| 2026-10-23 | Sprint start, S1–S5 build |
| 2026-10-23 | Deploy + demo URL |
| Next session | Playtest feedback, stretch items (tutorial, Playwright) |

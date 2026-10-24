# BEAT//BLOCK

Lumines-inspired endless rhythm block puzzle for the browser. Stack the seven tetrominoes, make same-colour 2×2 squares, and the sweep line clears them. Installable PWA, works offline, records stay on your device.

- Spec: [docs/PRD.html](docs/PRD.html) · Plan: [docs/SPRINT_PLAN.md](docs/SPRINT_PLAN.md) · Agent notes: [AGENTS.md](AGENTS.md)

```bash
npm install
npm run dev     # local dev
npm test        # engine unit tests (Vitest)
npm run build   # icons + typecheck + production build to dist/
```

Controls: ←/→ or A/D move · ↓/S soft drop · ↑/W/X rotate · Z rotate back · Space hard drop · Esc/P pause · Enter restart. On touch: pad buttons, or swipe on the board (tap rotates, flick down drops).

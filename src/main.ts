import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "./style.css";
import { Game, type GameCommand } from "./engine/game";
import { createRng, randomSeed, localDateKey, seedForDate } from "./engine/rng";
import { Renderer } from "./render";
import { bindGestures, bindKeyboard, bindPad } from "./input";
import { loadProfile, saveProfile, defaultProfile, recordDaily, type GameProfile } from "./storage";
import { Sound, vibrate } from "./audio";
import { THEMES, themeById, skinFor, dailyStartSkin, type Theme } from "./themes";
import { BeatClock, beatMsFor } from "./beat";
import { Tutorial, setupTutorialBoard } from "./tutorial";
import { copyText, formatTime, nativeShare, shareMessage, smsHref, whatsappHref, canonicalUrl } from "./share";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const boardCanvas = $<HTMLCanvasElement>("board");
const renderer = new Renderer(boardCanvas, $<HTMLCanvasElement>("next"), $<HTMLCanvasElement>("bg"));
const sound = new Sound();
let profile: GameProfile = defaultProfile();
let game = new Game(createRng(randomSeed()));
let lastRun = { score: 0, ms: 0 };

// ---------- mode (v2 S1) ----------
type Mode = "endless" | "daily";
let mode: Mode = "endless";
let runMode: Mode = "endless";
let runStartSkin = "rave";
let runDate = "";

// ---------- beat clock (TR-05): audio time when running, else performance.now ----------
const beat = new BeatClock(() => performance.now());
let audioClock = false;
function syncClockSource(): void {
  if (audioClock || sound.clockMs() === null) return;
  audioClock = true;
  beat.setSource(() => sound.clockMs() ?? performance.now());
}

// ---------- sheets ----------
const SHEETS = ["splash", "onboard", "home", "pause", "over", "settings", "records", "help"];
let current: string | null = "home";
let returnTo: string | null = null;

function show(id: string | null, from?: string | null): void {
  returnTo = from ?? null;
  current = id;
  for (const s of SHEETS) $(s).hidden = s !== id;
  document.body.classList.toggle("has-sheet", !!id);
  document.body.classList.toggle("on-home", id === "home");
  if (id) $(id).querySelector<HTMLElement>(".btn-primary, button")?.focus({ preventScroll: true });
  else boardCanvas.focus?.({ preventScroll: true });
}

function closeSheet(): void {
  show(returnTo);
}

// ---------- skins ----------
let skinTheme: Theme = THEMES[0];
let skinLevel = 0;
const inRun = () => game.status === "PLAYING" || game.status === "PAUSED";

function applyTheme(t: Theme): void {
  skinTheme = t;
  renderer.setTheme(t);
  sound.setSkin(t.bass, t.bassWave);
  document.documentElement.style.setProperty("--accent", t.accent);
  $("hudSkin").textContent = t.name;
  $("hudSkinLvl").textContent = String(skinLevel + 1);
}

/** Moves the run to the next skin once enough squares are cleared (never during the tutorial). */
function checkSkin(): void {
  if (tutorial.active) return;
  const { theme, level, progress } = skinFor(runStartSkin, game.squaresCleared);
  $("hudSkinBar").style.width = `${Math.round(progress * 100)}%`;
  if (level <= skinLevel) return;
  skinLevel = level;
  applyTheme(theme);
  renderer.onSkin(level, theme.name);
  sound.skinUp();
  vibrate(profile.settings.vibrationEnabled, [20, 40, 20, 40, 60]);
}

// ---------- settings ----------
function applySettings(): void {
  const s = profile.settings;
  renderer.setOptions({ symbols: s.symbols, highContrast: s.highContrast, reducedMotion: s.reducedMotion, effects: s.effects });
  // mid-run settings changes keep the skin the run has reached
  applyTheme(inRun() ? skinTheme : themeById(s.themeId));
  document.documentElement.classList.toggle("reduce-motion", s.reducedMotion);
  document.documentElement.classList.toggle("high-contrast", s.highContrast);
  sound.sfx = s.soundEffectsEnabled;
  sound.music = s.musicEnabled;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const pad = s.controlLayout === "pad" || (s.controlLayout === "auto" && coarse);
  document.body.classList.toggle("show-pad", pad);
  document.body.classList.toggle("lefty", s.leftHanded);
  resize();
}

function renderSettings(): void {
  const s = profile.settings;
  const list = $("themeList");
  list.innerHTML = "";
  for (const t of THEMES) {
    const b = document.createElement("button");
    b.className = "theme";
    b.setAttribute("aria-pressed", String(t.id === s.themeId));
    b.innerHTML = `<span class="theme-sw">${[...t.play, t.accent].map((c) => `<i style="background:${c};color:${c}"></i>`).join("")}</span><span>${t.name}</span>`;
    b.onclick = () => { s.themeId = t.id; persist(); applySettings(); renderSettings(); };
    list.appendChild(b);
  }
  const bind = (id: string, get: () => boolean, set: (v: boolean) => void) => {
    const el = $<HTMLInputElement>(id);
    el.checked = get();
    el.onchange = () => { set(el.checked); persist(); applySettings(); };
  };
  bind("setSfx", () => s.soundEffectsEnabled, (v) => (s.soundEffectsEnabled = v));
  bind("setMusic", () => s.musicEnabled, (v) => (s.musicEnabled = v));
  bind("setVibe", () => s.vibrationEnabled, (v) => (s.vibrationEnabled = v));
  bind("setFx", () => s.effects, (v) => (s.effects = v));
  bind("setMotion", () => s.reducedMotion, (v) => (s.reducedMotion = v));
  bind("setSymbols", () => s.symbols, (v) => (s.symbols = v));
  bind("setContrast", () => s.highContrast, (v) => (s.highContrast = v));
  bind("setLeft", () => s.leftHanded, (v) => (s.leftHanded = v));
  bind("setPad", () => document.body.classList.contains("show-pad"), (v) => (s.controlLayout = v ? "pad" : "none"));
}

function persist(): void {
  void saveProfile(profile);
}

function renderRecords(): void {
  const rows: [string, string][] = [
    ["Personal best", profile.personalBestScore.toLocaleString("en-US")],
    ["Longest survival", formatTime(profile.bestSurvivalMs)],
    ["Runs played", String(profile.totalRuns)],
    ["Time played", formatTime(profile.totalPlayTimeMs)],
    ["Highest combo", String(profile.highestCombo)],
    ["Squares cleared", profile.totalSquaresCleared.toLocaleString("en-US")],
    ["Furthest skin", profile.furthestSkin ? String(profile.furthestSkin) : "—"],
  ];
  $("recordList").innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd class="num">${v}</dd></div>`).join("");
}

function renderBest(): void {
  const best = profile.personalBestScore.toLocaleString("en-US");
  $("homeBest").textContent = best;
  $("barBest").textContent = best;
  $("hudBest").textContent = best;
  $("homeBestTime").textContent = profile.totalRuns ? `${formatTime(profile.bestSurvivalMs)} survived` : "No runs yet";
  renderDaily();
}

function yesterdayKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return localDateKey(new Date(y, m - 1, d - 1));
}

function renderDaily(): void {
  const today = localDateKey();
  const [, m, d] = today.split("-").map(Number);
  $("dailyDate").textContent = `${MONTHS[m - 1]} ${d}`;
  const played = profile.daily.date === today;
  $("dailyBest").textContent = played ? `Today's best ${profile.daily.best.toLocaleString("en-US")}` : "Same pieces for everyone today.";
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function setMode(m: Mode): void {
  mode = m;
  $("modeEndless").setAttribute("aria-pressed", String(m === "endless"));
  $("modeDaily").setAttribute("aria-pressed", String(m === "daily"));
  $("btnPlay").textContent = m === "daily" ? "Play today's drop" : "Play now";
}

// ---------- run lifecycle ----------
function startRun(): void {
  sound.unlock();
  syncClockSource();
  tutorial.stop();
  runMode = mode;
  if (runMode === "daily") {
    runDate = localDateKey();
    const seed = seedForDate(runDate);
    game = new Game(createRng(seed));
    runStartSkin = dailyStartSkin(seed);
  } else {
    game = new Game(createRng(randomSeed()));
    runStartSkin = profile.settings.themeId;
  }
  game.start();
  skinLevel = 0;
  applyTheme(themeById(runStartSkin));
  $("hudSkinBar").style.width = "0%";
  startBeat();
  $("btnPause").hidden = false;
  $("btnRestart").textContent = "Restart run";
  $("shareRow").hidden = true;
  show(null);
}

// ---------- tutorial ----------
const tutorial = new Tutorial(
  { coach: $("coach"), title: $("coachTitle"), body: $("coachBody"), dots: $("coachDots"), done: $<HTMLButtonElement>("coachDone") },
  () => document.body.classList.contains("show-pad"),
  { resetBoard: newTutorialGame, sweepTo: (x) => (game.sweepX = x) },
);

function newTutorialGame(): void {
  game = new Game(createRng(7)); // fixed seed: every new player sees the same lesson
  setupTutorialBoard(game);
  game.start();
}

function startTutorial(): void {
  sound.unlock();
  skinLevel = 0;
  applyTheme(themeById(profile.settings.themeId));
  runStartSkin = profile.settings.themeId;
  newTutorialGame();
  syncClockSource();
  startBeat();
  $("btnPause").hidden = false;
  show(null);
  tutorial.start();
}

function endTutorial(): void {
  profile.tutorialDone = true;
  persist();
  startRun();
}

function pauseRun(): void {
  if (game.status !== "PLAYING") return;
  game.pause();
  beat.pause();
  show("pause");
}

function resumeRun(): void {
  sound.unlock();
  game.resume();
  beat.resume();
  show(null);
}

function finishRun(): void {
  beat.stop();
  const ms = game.timeMs;
  const daily = runMode === "daily";
  const isBest = !daily && game.score > profile.personalBestScore;
  profile.totalRuns++;
  profile.totalPlayTimeMs += ms;
  profile.totalSquaresCleared += game.squaresCleared;
  profile.highestCombo = Math.max(profile.highestCombo, game.highestCombo);
  if (isBest) profile.personalBestScore = game.score;
  // Daily runs keep their own best (GDD-DAILY-02); Endless records stay Endless-only
  const dayBest = daily && recordDaily(profile.daily, runDate, game.score, ms, yesterdayKey(runDate));
  if (!daily) profile.bestSurvivalMs = Math.max(profile.bestSurvivalMs, ms);
  profile.furthestSkin = Math.max(profile.furthestSkin, skinLevel + 1);
  persist();
  lastRun = { score: game.score, ms };
  renderBest();
  $("overEyebrow").textContent = daily ? (dayBest ? "Daily drop · New day best" : "Daily drop · Run complete") : isBest ? "New personal best" : "Run complete";
  $("overEyebrow").classList.toggle("eyebrow-gold", isBest || dayBest);
  $("overScore").textContent = game.score.toLocaleString("en-US");
  $("overTime").textContent = `${formatTime(ms)} survived`;
  $("overBestLabel").textContent = daily ? "Today's best" : "Personal best";
  $("overBest").textContent = (daily ? profile.daily.best : profile.personalBestScore).toLocaleString("en-US");
  $("overSquares").textContent = String(game.squaresCleared);
  $("overCombo").textContent = String(game.highestCombo);
  const msg = shareMessage(lastRun.score, lastRun.ms);
  $<HTMLAnchorElement>("shareSms").href = smsHref(msg);
  $<HTMLAnchorElement>("shareWa").href = whatsappHref(msg);
  $("btnPause").hidden = true;
  // short delay so the final lock reads before the overlay (PRD 180–300ms)
  setTimeout(() => show("over"), profile.settings.reducedMotion ? 0 : 260);
}

let toastTimer = 0;
function toast(text: string): void {
  const t = $("toast");
  t.textContent = text;
  t.classList.remove("on");
  void t.offsetWidth;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("on"), 900);
}

// ---------- input ----------
const send = (cmd: GameCommand) => {
  if (cmd.type === "PAUSE") {
    if (game.status === "PLAYING") pauseRun();
    else if (game.status === "PAUSED" && current === "pause") resumeRun();
    return;
  }
  if (current) return; // menus open: ignore gameplay input
  game.command(cmd);
};
bindKeyboard(send, () => game.status === "PLAYING" || game.status === "PAUSED", () => {
  if (current === "home" || current === "over") startRun();
});
bindPad($("pad"), send);
bindGestures(boardCanvas, send, () => renderer.cellSize);

addEventListener("blur", () => game.releaseAll());
document.addEventListener("visibilitychange", () => { if (document.hidden) pauseRun(); });

// ---------- buttons ----------
$("btnPlay").onclick = () => (profile.tutorialDone ? startRun() : startTutorial());
$("modeEndless").onclick = () => setMode("endless");
$("modeDaily").onclick = () => setMode("daily");
$("coachDone").onclick = endTutorial;
$("coachSkip").onclick = endTutorial;
$("btnTutorial").onclick = startTutorial;
$("btnAgain").onclick = startRun;
$("btnPause").onclick = pauseRun;
$("btnResume").onclick = resumeRun;
$("btnRestart").onclick = (e) => {
  const b = e.currentTarget as HTMLButtonElement;
  if (b.dataset.armed) { delete b.dataset.armed; startRun(); return; }
  b.dataset.armed = "1";
  b.textContent = "Tap again to restart";
};
$("btnHome").onclick = () => { game.status = "GAME_OVER"; beat.stop(); renderDaily(); tutorial.stop(); $("btnPause").hidden = true; show("home"); };
$("btnOverHome").onclick = () => { renderDaily(); show("home"); };
$("btnSettingsTop").onclick = () => { if (game.status === "PLAYING") { game.pause(); beat.pause(); } renderSettings(); show("settings", game.status === "PAUSED" ? "pause" : current); };
document.querySelectorAll<HTMLElement>("[data-open]").forEach((b) => {
  b.onclick = () => {
    const id = b.dataset.open!;
    if (id === "settings") renderSettings();
    if (id === "records") renderRecords();
    show(id, current);
  };
});
document.querySelectorAll<HTMLElement>("[data-close]").forEach((b) => (b.onclick = closeSheet));
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && current && ["settings", "records", "help"].includes(current)) closeSheet();
});
$("btnReset").onclick = async (e) => {
  const b = e.currentTarget as HTMLButtonElement;
  if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again to erase records and settings"; return; }
  delete b.dataset.armed;
  b.textContent = "Reset all data";
  profile = defaultProfile();
  await saveProfile(profile);
  applySettings(); renderSettings(); renderBest();
  toast("Data reset");
};

$("btnShare").onclick = async () => {
  const msg = shareMessage(lastRun.score, lastRun.ms);
  const r = await nativeShare(msg);
  if (r === "unsupported" || r === "failed") $("shareRow").hidden = false;
};
$("shareCopy").onclick = async () => toast((await copyText(shareMessage(lastRun.score, lastRun.ms))) ? "Message copied" : "Copy failed");
$("shareLink").onclick = async () => toast((await copyText(canonicalUrl())) ? "Link copied" : "Copy failed");

// PWA install prompt
let installEvt: any = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("btnInstall").hidden = false; });
$("btnInstall").onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $("btnInstall").hidden = true; };
addEventListener("appinstalled", () => ($("btnInstall").hidden = true));

// ---------- layout ----------
const wrap = $("boardWrap");
function resize(): void {
  const r = wrap.getBoundingClientRect();
  if (r.width > 0 && r.height > 0) renderer.resize(r.width, r.height);
}
new ResizeObserver(resize).observe(wrap);
addEventListener("resize", () => renderer.resizeBg());

// ---------- loop: fixed 60Hz simulation, render every frame (PRD §10.3) ----------
const STEP = 1000 / 60;
const MAX_STEPS = 16; // covers the 250ms frame clamp, so slow devices stay real-time
let acc = 0, last = performance.now();
function currentBeatMs(): number {
  return beatMsFor(skinTheme.bpm, game.seconds);
}
function startBeat(): void {
  beat.start(currentBeatMs());
}
function bump(el: HTMLElement): void {
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}
let shown = { score: -1, sec: -1, speed: "", combo: -1 };

function frame(now: number): void {
  const dt = Math.min(250, now - last);
  last = now;
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < MAX_STEPS) { game.step(STEP); acc -= STEP; steps++; }
  if (steps === MAX_STEPS) acc = 0; // drop catch-up after a stall

  const events = game.drainEvents();
  for (const ev of events) {
    const vib = profile.settings.vibrationEnabled;
    switch (ev.kind) {
      case "move": sound.move(); break;
      case "rotate": sound.rotate(); break;
      case "lock": sound.lock(ev.hard); renderer.onLock(ev.cells, ev.dropped); if (ev.hard) vibrate(vib, 12); break;
      case "formed": sound.formed(Math.max(1, Math.round(ev.cells.length / 4))); renderer.onFormed(ev.cells); vibrate(vib, 8); break;
      case "column": break;
      case "clear":
        renderer.onClear(ev.cells, ev.colors, ev.squares, ev.points, ev.combo);
        sound.clear(ev.squares, ev.combo);
        vibrate(vib, 25);
        bump($("hudScore"));
        checkSkin();
        break;
      case "gameover":
        sound.gameOver();
        vibrate(vib, [40, 60, 80]);
        if (tutorial.active) newTutorialGame(); // can't fail the tutorial: just reset the board
        else finishRun();
        break;
    }
  }
  tutorial.handle(events);

  // music clock: game time only, so pause stops the beat. Each skin sets its tempo; +up to 24 BPM over a run.
  if (game.status === "PLAYING") {
    if (!beat.isRunning) beat.resume(); // e.g. resumed from the settings sheet
    for (const n of beat.poll(currentBeatMs(), 1)) {
      sound.beat(n, beat.beatMs);
      renderer.onBeat();
      if (qaDrift) qaDrift.push([n, beat.time(), sound.clockMs()]);
    }
  }

  renderer.draw(game, dt);

  // HUD: touch the DOM only when a value changes
  if (game.score !== shown.score) { shown.score = game.score; $("hudScore").textContent = game.score.toLocaleString("en-US"); }
  const sec = Math.floor(game.timeMs / 1000);
  if (sec !== shown.sec) { shown.sec = sec; $("hudTime").textContent = formatTime(game.timeMs); }
  const sp = `${(game.speed / 0.45).toFixed(1)}×`;
  if (sp !== shown.speed) { shown.speed = sp; $("hudSpeed").textContent = sp; }
  if (game.combo !== shown.combo) { shown.combo = game.combo; $("hudCombo").textContent = game.combo > 1 ? `×${game.combo}` : "—"; }

  requestAnimationFrame(frame);
}

// QA builds only (VITE_QA=1): lets a test jump the run forward. Never present in production builds.
// Latency spike (PRD-v2 risk #1): QA builds log [beat, clockMs, audioMs] so drift can be measured on devices.
const qaDrift: [number, number, number | null][] | null = import.meta.env.VITE_QA ? [] : null;
if (import.meta.env.VITE_QA) (window as any).__bb = { game: () => game, checkSkin, beat, drift: () => qaDrift };

// ---------- boot ----------
(async () => {
  profile = await loadProfile();
  applySettings();
  renderBest();
  show("splash");
  requestAnimationFrame(frame);
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
})();

// ---------- splash + onboarding (v1.1) ----------
const ONBOARD = [
  { k: "1 of 3 · Stack", t: "Every piece carries two colours.", b: "Move and rotate to line them up. Swipe, tap, or use the pad.",
    art: ["c1", "c2", "c1", "c1"], cols: 2 },
  { k: "2 of 3 · Match", t: "Make a 2×2 square.", b: "Four cells of one colour lock together. Bigger blocks score more.",
    art: ["", "c1 hit", "c1 hit", "c2", "c2", "c1 hit", "c1 hit", "c2"], cols: 4 },
  { k: "3 of 3 · Sweep", t: "The beat clears it.", b: "The sweep line moves with the music. Clear on every pass to chain combos.",
    art: ["", "", "c1 fade", "c1 fade", "c2", "", "c2", "c1", "c1 fade", "c1 fade", "c2", "c1"], cols: 6, sweep: true },
];
let onStep = 0;

function renderOnboard(): void {
  const s = ONBOARD[onStep];
  $("onEyebrow").textContent = s.k;
  $("onTitle").textContent = s.t;
  $("onBody").textContent = s.b;
  $("onNext").textContent = onStep === ONBOARD.length - 1 ? "Try it" : "Next";
  $("onDots").innerHTML = ONBOARD.map((_, i) => `<i class="${i === onStep ? "on" : ""}"></i>`).join("");
  const art = $("onArt");
  art.innerHTML = `<div class="mini" style="grid-template-columns:repeat(${s.cols},1fr)">${s.art.map((c) => `<i class="${c}"></i>`).join("")}</div>${s.sweep ? '<span class="mini-sweep"></span>' : ""}`;
}

$("btnStart").onclick = () => {
  sound.unlock();
  if (profile.tutorialDone) show("home");
  else { onStep = 0; renderOnboard(); show("onboard"); }
};
$("onNext").onclick = () => {
  if (onStep < ONBOARD.length - 1) { onStep++; renderOnboard(); return; }
  show(null);
  startTutorial();
};
$("onSkip").onclick = () => { profile.tutorialDone = true; persist(); show("home"); };

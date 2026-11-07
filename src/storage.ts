// v2 (2026-11-07, PRD-v2 TR-02): adds Daily Drop records and beat settings.
export const SCHEMA_VERSION = 2;

export interface DailyRecord {
  date: string;       // yyyy-mm-dd of the last Daily played ("" = never)
  best: number;       // best score on `date` (unlimited retries; best is kept)
  timeMs: number;     // survival time of that best run
  streak: number;     // consecutive days played (UI in S4)
  lastPlayed: string; // yyyy-mm-dd
}

export interface Settings {
  themeId: string;
  musicEnabled: boolean;
  soundEffectsEnabled: boolean;
  vibrationEnabled: boolean;
  reducedMotion: boolean;
  effects: boolean;
  symbols: boolean;
  highContrast: boolean;
  leftHanded: boolean;
  controlLayout: "auto" | "pad" | "none";
  beatWindow: "normal" | "wide";
  audioOffsetMs: number;
  classicSweep: boolean;
  cueMode: "unset" | "sound" | "silent"; // S3: chosen on first launch
  beatVibration: boolean;                // S3: vibrate on every beat (Android web; iOS needs the S4 native wrap)
}

export interface GameProfile {
  schemaVersion: number;
  personalBestScore: number;
  bestSurvivalMs: number;
  totalRuns: number;
  totalPlayTimeMs: number;
  totalSquaresCleared: number;
  highestCombo: number;
  furthestSkin: number;
  tutorialDone: boolean;
  daily: DailyRecord;
  settings: Settings;
}

export function emptyDaily(): DailyRecord {
  return { date: "", best: 0, timeMs: 0, streak: 0, lastPlayed: "" };
}

/** Records a finished Daily run. Returns true if it set the day's best. */
export function recordDaily(d: DailyRecord, date: string, score: number, timeMs: number, yesterday: string): boolean {
  if (d.lastPlayed !== date) d.streak = d.lastPlayed === yesterday ? d.streak + 1 : 1;
  d.lastPlayed = date;
  if (d.date !== date) { d.date = date; d.best = 0; d.timeMs = 0; }
  if (score <= d.best && d.timeMs > 0) return false;
  const isBest = score > d.best;
  d.best = Math.max(d.best, score);
  d.timeMs = timeMs;
  return isBest;
}

export function defaultProfile(): GameProfile {
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    schemaVersion: SCHEMA_VERSION,
    personalBestScore: 0,
    bestSurvivalMs: 0,
    totalRuns: 0,
    totalPlayTimeMs: 0,
    totalSquaresCleared: 0,
    highestCombo: 0,
    furthestSkin: 0,
    tutorialDone: false,
    daily: emptyDaily(),
    settings: {
      themeId: "rave",
      musicEnabled: true,
      soundEffectsEnabled: true,
      vibrationEnabled: true,
      reducedMotion: reduce,
      effects: true,
      symbols: false,
      highContrast: false,
      leftHanded: false,
      controlLayout: "auto",
      beatWindow: "normal",
      audioOffsetMs: 0,
      classicSweep: false,
      cueMode: "unset",
      beatVibration: true,
    },
  };
}

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

/** Accepts anything (old schema, garbage, null) and returns a valid current profile. */
export function migrate(raw: unknown): GameProfile {
  const d = defaultProfile();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, any>;
  const s = (r.settings && typeof r.settings === "object" ? r.settings : {}) as Record<string, unknown>;
  return {
    schemaVersion: SCHEMA_VERSION,
    personalBestScore: num(r.personalBestScore, 0),
    bestSurvivalMs: num(r.bestSurvivalMs, 0),
    totalRuns: num(r.totalRuns, 0),
    totalPlayTimeMs: num(r.totalPlayTimeMs, 0),
    totalSquaresCleared: num(r.totalSquaresCleared, 0),
    highestCombo: num(r.highestCombo, 0),
    furthestSkin: num(r.furthestSkin, 0),
    // existing players (any runs on record) skip the first-run tutorial
    tutorialDone: bool(r.tutorialDone, num(r.totalRuns, 0) > 0),
    daily: migrateDaily(r.daily),
    settings: {
      themeId: typeof s.themeId === "string" ? s.themeId : d.settings.themeId,
      musicEnabled: bool(s.musicEnabled, d.settings.musicEnabled),
      soundEffectsEnabled: bool(s.soundEffectsEnabled, d.settings.soundEffectsEnabled),
      vibrationEnabled: bool(s.vibrationEnabled, d.settings.vibrationEnabled),
      reducedMotion: bool(s.reducedMotion, d.settings.reducedMotion),
      effects: bool(s.effects, d.settings.effects),
      symbols: bool(s.symbols, d.settings.symbols),
      highContrast: bool(s.highContrast, d.settings.highContrast),
      leftHanded: bool(s.leftHanded, d.settings.leftHanded),
      controlLayout: s.controlLayout === "pad" || s.controlLayout === "none" ? s.controlLayout : "auto",
      beatWindow: s.beatWindow === "wide" ? "wide" : "normal",
      audioOffsetMs: typeof s.audioOffsetMs === "number" && Number.isFinite(s.audioOffsetMs) ? Math.max(-300, Math.min(300, s.audioOffsetMs)) : 0,
      classicSweep: bool(s.classicSweep, false),
      cueMode: s.cueMode === "sound" || s.cueMode === "silent" ? s.cueMode : "unset",
      beatVibration: bool(s.beatVibration, true),
    },
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function migrateDaily(raw: unknown): DailyRecord {
  if (!raw || typeof raw !== "object") return emptyDaily();
  const r = raw as Record<string, unknown>;
  const date = (v: unknown) => (typeof v === "string" && DATE_RE.test(v) ? v : "");
  return { date: date(r.date), best: num(r.best, 0), timeMs: num(r.timeMs, 0), streak: num(r.streak, 0), lastPlayed: date(r.lastPlayed) };
}

const DB = "beatblock", STORE = "kv", KEY = "profile", LS_KEY = "beatblock.profile";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadProfile(): Promise<GameProfile> {
  try {
    const db = await openDb();
    const raw = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (raw) return migrate(raw);
  } catch { /* fall through to localStorage */ }
  try {
    return migrate(JSON.parse(localStorage.getItem(LS_KEY) ?? "null"));
  } catch {
    return defaultProfile();
  }
}

/** Writes to IndexedDB and mirrors to localStorage. Failures never break gameplay. */
export async function saveProfile(p: GameProfile): Promise<void> {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(p, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* ignore */ }
}

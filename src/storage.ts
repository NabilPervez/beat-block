export const SCHEMA_VERSION = 1;

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
  settings: Settings;
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
    },
  };
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

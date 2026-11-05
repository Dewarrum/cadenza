// Player settings, kept in localStorage under one versioned key. parseSettings() is pure: a
// missing or broken value gives the defaults, unknown fields are dropped and a bad field falls
// back to its default on its own.
import type { TierName } from "./piece.ts";

export const SETTINGS_KEY = "cadenza.settings.v1";
const LEGACY_HOWTO_KEY = "cadenza.howto-seen"; // S2-S3 kept only this flag

export const DEFAULT_KEYS = ["KeyD", "KeyF", "KeyJ", "KeyK"];
export const DEFAULT_APPROACH_MS: Record<TierName, number> = { easy: 1500, normal: 1200, hard: 1200 };
export const APPROACH_RANGE = { min: 800, max: 2500, step: 50 };
export const OFFSET_RANGE = { min: -400, max: 400, step: 5 };
// Space hits any lane on Easy, Esc pauses; the others would fight the menus.
const RESERVED_KEYS = new Set(["Space", "Escape", "Enter", "Tab", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"]);

export type Settings = {
  // Audio offset in ms on top of the output latency the browser reports (the song clock already
  // compensates that part). Positive = the player's taps land late. null = never calibrated.
  audioOffsetMs: number | null;
  approachMs: number | null; // one override for every tier; null = per-tier defaults
  volume: number; // 0-1
  keySound: boolean;
  keys: string[]; // KeyboardEvent.code for lanes 1-4
  howtoSeen: boolean;
};

export const DEFAULTS: Settings = { audioOffsetMs: null, approachMs: null, volume: 1, keySound: true, keys: DEFAULT_KEYS, howtoSeen: false };

const inRange = (v: unknown, r: { min: number; max: number }) => typeof v === "number" && Number.isFinite(v) && v >= r.min && v <= r.max;

function validKeys(v: unknown): v is string[] {
  return Array.isArray(v) && v.length === 4 && v.every((k) => typeof k === "string" && k && !RESERVED_KEYS.has(k)) && new Set(v).size === 4;
}

export function parseSettings(raw: string | null, legacyHowtoSeen = false): Settings {
  let s: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) s = parsed as Record<string, unknown>;
  } catch {
    // broken JSON: defaults
  }
  return {
    audioOffsetMs: inRange(s.audioOffsetMs, OFFSET_RANGE) ? Math.round(s.audioOffsetMs as number) : null,
    approachMs: inRange(s.approachMs, APPROACH_RANGE) ? (s.approachMs as number) : null,
    volume: inRange(s.volume, { min: 0, max: 1 }) ? (s.volume as number) : DEFAULTS.volume,
    keySound: typeof s.keySound === "boolean" ? s.keySound : DEFAULTS.keySound,
    keys: validKeys(s.keys) ? [...s.keys] : [...DEFAULT_KEYS],
    howtoSeen: typeof s.howtoSeen === "boolean" ? s.howtoSeen : legacyHowtoSeen,
  };
}

export function loadSettings(): Settings {
  return parseSettings(localStorage.getItem(SETTINGS_KEY), localStorage.getItem(LEGACY_HOWTO_KEY) === "1");
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  localStorage.removeItem(LEGACY_HOWTO_KEY);
}

export const approachFor = (s: Settings, tier: TierName) => s.approachMs ?? DEFAULT_APPROACH_MS[tier];

export const clampOffset = (ms: number) => Math.round(Math.min(OFFSET_RANGE.max, Math.max(OFFSET_RANGE.min, ms)));

// Binds `code` to `lane`, or says why not: reserved keys and keys of another lane are refused.
export function rebind(keys: readonly string[], lane: number, code: string): string[] | string {
  if (RESERVED_KEYS.has(code)) return `${keyLabel(code)} is reserved`;
  const other = keys.indexOf(code);
  if (other >= 0 && other !== lane) return `${keyLabel(code)} is already lane ${other + 1}`;
  return keys.map((k, i) => (i === lane ? code : k));
}

const SYMBOLS: Record<string, string> = {
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backslash: "\\", BracketLeft: "[", BracketRight: "]",
  Minus: "-", Equal: "=", Backquote: "`", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
};

export function keyLabel(code: string): string {
  return SYMBOLS[code] ?? code.replace(/^(Key|Digit)/, "").replace(/^Numpad/, "Num ");
}

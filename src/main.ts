// Screens: title -> piece list -> (how to play, once) -> play <-> pause -> results -> piece list.
// Settings open from the piece list and the pause overlay; calibration from the settings.
import { AudioEngine, type Clock, ManualClock, reportedLatency } from "./audio/engine.ts";
import { samplesCached } from "./audio/piano.ts";
import { buildChart } from "./game/chart.ts";
import { Play, type Source } from "./game/play.ts";
import type { Summary } from "./game/score.ts";
import { resumeRun, type Run, startRun } from "./game/timeline.ts";
import { LanePointers } from "./input/lanes.ts";
import type { Piece, TierName } from "./piece.ts";
import { loadPiece, PIECES, type PieceInfo } from "./pieces.ts";
import { startPwa } from "./pwa.ts";
import { Playfield } from "./render/playfield.ts";
import { type Best, clearResults, loadResults, recordResult } from "./results.ts";
import { calibrationScreen } from "./screens/calibration.ts";
import { settingsScreen } from "./screens/settings.ts";
import { approachFor, clampOffset, keyLabel, loadSettings, saveSettings, type Settings } from "./settings.ts";

const TIERS: TierName[] = ["easy", "normal", "hard"];

const params = new URLSearchParams(location.search);
const manualClock = params.get("clock") === "manual"; // e2e bot drives the song clock
const keySoundOff = params.get("keysound") === "off"; // test switch; overrides the setting
const phoneLandscape = matchMedia("(orientation: landscape) and (pointer: coarse) and (max-height: 500px)");
const touchDevice = matchMedia("(pointer: coarse)");
const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

type Screen = "title" | "list" | "howto" | "play" | "results" | "settings" | "calibration";
type Session = { play: Play; clock: Clock; run: Run; piece: Piece; tier: TierName; frame: number; pausedAt: number | null };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const playfield = new Playfield($<HTMLCanvasElement>("field"));
let screen: Screen = "title";
let engine: AudioEngine | null = null;
let session: Session | null = null;
let lastSummary: Summary | null = null;
let pending: [Piece, TierName] | null = null; // the play waiting behind the how-to card
let lastPlayed: [Piece, TierName] | null = null; // for Retry, and the tier the settings speak of
let settings: Settings = loadSettings();
let keyMap: Record<string, Source> = {};
let settingsFrom: Screen = "list";

for (const el of document.querySelectorAll<HTMLElement>(".ios-only")) el.hidden = !iOS;
if (touchDevice.matches) $("title").querySelector(".begin")!.textContent = "Tap to begin";
// The play screen draws text with the page's fonts; load them before the first frame needs them.
for (const font of ['400 20px "Bodoni Moda"', 'italic 400 20px "Bodoni Moda"', '600 20px "Hanken Grotesk"']) void document.fonts?.load(font).catch(() => {});

const capital = (word: string) => `${word[0].toUpperCase()}${word.slice(1)}`;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") => Object.assign(document.createElement(tag), { className, textContent: text });

function show(name: Screen): void {
  for (const el of document.querySelectorAll<HTMLElement>(".screen")) el.hidden = el.id !== name;
  screen = name;
  document.body.dataset.screen = name; // the update toast stays out of the play screen
}

// Settings: saved and applied at once (volume and offset also mid-piece, key sound from the
// next play).
function applySettings(): void {
  keyMap = Object.fromEntries<Source>([...settings.keys.map((code, lane): [string, Source] => [code, lane]), ["Space", "any"]]);
  for (const el of document.querySelectorAll(".keys-hint")) el.textContent = settings.keys.map(keyLabel).join(" ");
  engine?.setVolume(settings.volume);
  if (session) session.play.offset = settings.audioOffsetMs ?? 0;
}

function changeSettings(patch: Partial<Settings>): void {
  settings = { ...settings, ...patch };
  saveSettings(settings);
  applySettings();
  if (screen === "settings") settingsUi.render();
}

const latencyMs = () => (engine ? Math.round(reportedLatency(engine.ctx) * 1000) : 0);

const settingsUi = settingsScreen({
  get: () => settings,
  change: changeSettings,
  latencyMs,
  tier: () => session?.tier ?? lastPlayed?.[1] ?? null,
  calibrate: () => {
    show("calibration");
    calibrationUi.open();
  },
  clearResults,
  back: () => {
    show(settingsFrom);
    if (settingsFrom === "list") renderList();
  },
});

const calibrationUi = calibrationScreen({
  engine: () => engine,
  latencyMs,
  apply: (ms) => changeSettings({ audioOffsetMs: clampOffset(ms) }),
  close: () => {
    show("settings");
    settingsUi.render();
  },
});

function openSettings(): void {
  settingsFrom = screen;
  show("settings");
  settingsUi.open();
}
$("open-settings").addEventListener("click", openSettings);
$("pause-settings").addEventListener("click", openSettings);
applySettings();
startPwa();

// Title: the first tap creates and unlocks the AudioContext, then the piano preloads. Taps
// unlock audio on pointerup/click only, so this listens to click, not pointerdown.
function begin(): void {
  if (screen !== "title") return;
  engine = new AudioEngine();
  engine.setVolume(settings.volume);
  engine.ctx.addEventListener("statechange", () => {
    if (engine?.ctx.state !== "running") interrupt(); // phone call, lock screen, other app took audio
  });
  show("list");
  renderList();
  const status = $("piano-status");
  engine
    .loadPiano((f) => {
      $("progress-bar").style.width = `${Math.round(f * 100)}%`;
      status.textContent = `Loading piano ${Math.round(f * 100)}%`;
    })
    .then(() => {
      $("progress-bar").parentElement!.hidden = true;
      status.textContent = "Piano ready";
      renderList();
      return samplesCached();
    })
    .then((cached) => cached && (status.textContent = "Piano ready · works offline"))
    .catch((err: unknown) => {
      $("progress-bar").parentElement!.hidden = true;
      status.textContent = `Piano failed to load: ${err}`;
    });
}
$("title").addEventListener("click", begin);

const bestText = (b: Best) => `${b.accuracy.toFixed(2)}% ${b.grade}${b.fullCombo ? " · Full Combo" : ""}`;

// A programme entry per piece: composer, title, opus, then a key per tier with its level and
// the best grade ("S · FC" for a full combo).
function renderList(): void {
  const results = loadResults();
  $("pieces").replaceChildren(
    ...PIECES.map((info) => {
      const tiers = el("div", "tiers");
      for (const tier of TIERS) {
        const button = el("button");
        button.type = "button";
        button.dataset.tier = tier;
        button.disabled = !engine?.pianoReady;
        const best = results[info.id]?.[tier];
        const mark = el("small", "best");
        if (best) {
          mark.dataset.grade = best.grade;
          mark.append(el("b", "", best.grade), best.fullCombo ? " · FC" : "");
        }
        button.append(el("span", "", capital(tier)), el("small", "", `Level ${info.levels[tier]}`), mark);
        button.addEventListener("click", () => void choose(info, tier));
        tiers.append(button);
      }
      const item = el("li", "piece");
      item.append(el("p", "composer", info.composer), el("h3", "name", info.title), el("p", "opus", info.opus), tiers);
      return item;
    }),
  );
}

// A tier button: fetch the piece (precached by the service worker), then play.
async function choose(info: PieceInfo, tier: TierName): Promise<void> {
  if (!engine) return;
  void engine.unlock(); // still inside the tap
  (document.activeElement as HTMLElement | null)?.blur(); // Space must not re-click the tier button
  let piece: Piece;
  try {
    piece = await loadPiece(info);
  } catch (err) {
    $("piano-status").textContent = `${info.title} failed to load: ${err}`;
    return;
  }
  if (screen !== "list") return;
  if (!settings.howtoSeen) {
    pending = [piece, tier];
    return show("howto");
  }
  startPlay(piece, tier);
}

function startPlay(piece: Piece, tier: TierName): void {
  if (!engine) return;
  void engine.unlock(); // still inside the tap
  lastPlayed = [piece, tier];
  show("play");
  playfield.resize();
  $("paused").hidden = true;
  lanes.reset();
  engine.keySound = settings.keySound && !keySoundOff;
  const chart = buildChart(piece, tier, engine.keySound);
  const run = startRun(chart, approachFor(settings, tier));
  const clock = engine.start(chart, run, manualClock);
  const play = new Play(chart, engine, { offset: settings.audioOffsetMs ?? 0, anyLane: tier === "easy" });
  session = { play, clock, run, piece, tier, frame: 0, pausedAt: null };
  frame();
  if (phoneLandscape.matches) pause();
}

function dismissHowto(): void {
  if (screen !== "howto" || !pending) return;
  changeSettings({ howtoSeen: true });
  startPlay(...pending);
  pending = null;
}
$("howto").addEventListener("click", dismissHowto);

// Advances game state to the clock; returns false once the song has ended.
function tick(s: Session): boolean {
  const now = s.clock.now();
  s.play.update(now);
  if (!s.play.finished(now)) return true;
  endPlay(s);
  return false;
}

function frame(): void {
  const s = session;
  if (!s || s.pausedAt !== null || !tick(s)) return;
  playfield.draw(s.play, s.clock.now(), approachFor(settings, s.tier), s.run.clicks);
  s.frame = requestAnimationFrame(frame);
}

// Stops the clock and every scheduled sound at once. Unlimited; safe to call repeatedly.
function pause(): void {
  const s = session;
  if (!s || s.pausedAt !== null || screen !== "play") return;
  s.pausedAt = s.clock.now();
  cancelAnimationFrame(s.frame);
  engine?.stop();
  s.play.pause();
  lanes.reset();
  $("paused").hidden = false;
}

// Backgrounding, a call or a lost audio context: pause a play, stop a calibration run.
function interrupt(): void {
  pause();
  calibrationUi.stop();
}

// Rewinds about 2 s and counts in 3 beats. Judged notes stay judged; music picks up at the pause.
async function resume(): Promise<void> {
  const s = session;
  if (!s || s.pausedAt === null || !engine) return;
  await engine.unlock().catch(() => {});
  if (session !== s || s.pausedAt === null || phoneLandscape.matches || screen !== "play") return;
  s.run = resumeRun(s.play.chart, s.pausedAt);
  s.clock = engine.start(s.play.chart, s.run, manualClock);
  s.play.resume(s.run.soundFrom);
  s.pausedAt = null;
  $("paused").hidden = true;
  (document.activeElement as HTMLElement | null)?.blur();
  frame();
}

function toList(): void {
  show("list");
  renderList();
}

function quit(): void {
  engine?.stop();
  session = null;
  toList();
}

$("pause").addEventListener("click", pause);
$("resume").addEventListener("click", () => void resume());
$("restart").addEventListener("click", () => {
  const s = session;
  if (s) startPlay(s.piece, s.tier);
});
$("quit").addEventListener("click", quit);

function endPlay(s: Session): void {
  cancelAnimationFrame(s.frame);
  engine?.stop();
  session = null;
  const summary = s.play.summary();
  lastSummary = summary;
  const { best, previous, isNew } = recordResult(s.piece.id, s.tier, summary);
  $("result-piece").replaceChildren(s.piece.title, el("span", "", capital(s.tier)));
  $("grade").textContent = summary.grade;
  $("grade").dataset.grade = summary.grade;
  $("accuracy").textContent = `${summary.accuracy.toFixed(2)}%`;
  $("full-combo").hidden = !summary.fullCombo;
  $("best").textContent = isNew ? (previous ? `New best · before: ${bestText(previous)}` : "New best") : `Best: ${bestText(best)}`;
  $("best").classList.toggle("new", isNew);
  $("counts").replaceChildren(
    ...(["perfect", "great", "good", "miss"] as const).map((j) => {
      const row = el("div", j);
      row.append(el("dt", "", capital(j)), el("dd", "", String(summary.counts[j])));
      return row;
    }),
  );
  $("max-combo").replaceChildren("Max combo ", el("b", "", String(summary.maxCombo)));
  show("results");
}

$("back").addEventListener("click", toList);
$("retry").addEventListener("click", () => lastPlayed && startPlay(...lastPlayed));

// Input: lanes on the canvas, keys on the window. Both use the event timestamp.
const lanes = new LanePointers($("field"), {
  down: (lane, t) => session?.pausedAt === null && session.play.press(lane, session.clock.fromEvent(t)),
  up: (lane, t) => session?.pausedAt === null && session.play.release(lane, session.clock.fromEvent(t)),
});

window.addEventListener("keydown", (e) => {
  if (screen === "title") return begin();
  if (screen === "howto") return dismissHowto();
  if (screen === "settings") return settingsUi.key(e);
  if (screen === "calibration") return calibrationUi.key(e);
  if (screen === "results" && e.code === "Enter") return toList();
  if (screen !== "play" || !session) return;
  if (e.code === "Escape") return void (session.pausedAt === null ? pause() : resume());
  const source = keyMap[e.code];
  if (source === undefined || session.pausedAt !== null) return;
  e.preventDefault();
  if (!e.repeat) session.play.press(source, session.clock.fromEvent(e.timeStamp));
});

window.addEventListener("keyup", (e) => {
  const source = keyMap[e.code];
  if (screen !== "play" || source === undefined || session?.pausedAt !== null) return;
  e.preventDefault();
  session.play.release(source, session.clock.fromEvent(e.timeStamp));
});

// Interruptions pause at once; coming back re-resumes the AudioContext (play stays paused).
document.addEventListener("visibilitychange", () => {
  if (document.hidden) interrupt();
  else if (engine && engine.ctx.state !== "running") void engine.ctx.resume().catch(() => {});
});
window.addEventListener("pagehide", interrupt);
window.addEventListener("blur", () => touchDevice.matches && interrupt());
const checkOrientation = () => {
  $("rotate").hidden = !phoneLandscape.matches;
  if (phoneLandscape.matches) interrupt();
};
phoneLandscape.addEventListener("change", checkOrientation);
checkOrientation();

// Debug hook for the e2e bot and manual poking in the console.
declare global {
  interface Window {
    __cadenza: unknown;
  }
}
window.__cadenza = {
  get screen() {
    return screen;
  },
  get pianoReady() {
    return engine?.pianoReady ?? false;
  },
  get summary() {
    return lastSummary;
  },
  get paused() {
    return session ? session.pausedAt !== null : false;
  },
  get settings() {
    return settings;
  },
  chart: () => session?.play.chart.notes.map(({ time, lane, hold }) => ({ time, lane, hold })) ?? [],
  end: () => session?.play.chart.end ?? 0,
  judged: () => session?.play.results.filter((r) => r !== null) ?? [],
  results: () => session?.play.results ?? [],
  lit: () => session?.play.litLanes() ?? [],
  now: () => session?.clock.now() ?? 0,
  audio: () => engine?.stats,
  // Manual clock only: jump the song clock to `ms` and run the game logic.
  advance(ms: number) {
    if (!session || !(session.clock instanceof ManualClock)) throw new Error("advance() needs ?clock=manual during play");
    if (session.pausedAt !== null) throw new Error("advance() while paused");
    session.clock.time = ms;
    tick(session);
  },
};

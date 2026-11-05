// Screens: title -> piece list -> (how to play, once) -> play <-> pause -> results -> piece list.
import { AudioEngine, type Clock, ManualClock } from "./audio/engine.ts";
import { buildChart } from "./game/chart.ts";
import { Play, type Source } from "./game/play.ts";
import type { Summary } from "./game/score.ts";
import { resumeRun, type Run, startRun } from "./game/timeline.ts";
import { LanePointers } from "./input/lanes.ts";
import type { Piece, TierName } from "./piece.ts";
import { Playfield } from "./render/playfield.ts";

const modules = import.meta.glob<Piece>("../pieces/*.json", { eager: true, import: "default" });
const pieces = Object.entries(modules)
  .filter(([path]) => !path.endsWith(".overrides.json"))
  .map(([, piece]) => piece);

const TIERS: TierName[] = ["easy", "normal", "hard"];
const APPROACH_MS: Record<TierName, number> = { easy: 1500, normal: 1200, hard: 1200 };
const AUDIO_OFFSET_MS = 0; // calibration arrives in S4
const KEYS: Record<string, Source> = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3, Space: "any" };
const HOWTO_KEY = "cadenza.howto-seen";

const params = new URLSearchParams(location.search);
const manualClock = params.get("clock") === "manual"; // e2e bot drives the song clock
const keySound = params.get("keysound") !== "off"; // settings screen arrives in S4
const phoneLandscape = matchMedia("(orientation: landscape) and (pointer: coarse) and (max-height: 500px)");
const touchDevice = matchMedia("(pointer: coarse)");
const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

type Screen = "title" | "list" | "howto" | "play" | "results";
type Session = { play: Play; clock: Clock; run: Run; piece: Piece; tier: TierName; frame: number; pausedAt: number | null };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const playfield = new Playfield($<HTMLCanvasElement>("field"));
let screen: Screen = "title";
let engine: AudioEngine | null = null;
let session: Session | null = null;
let lastSummary: Summary | null = null;
let pending: [Piece, TierName] | null = null; // the play waiting behind the how-to card

for (const el of document.querySelectorAll<HTMLElement>(".ios-only")) el.hidden = !iOS;

function show(name: Screen): void {
  for (const el of document.querySelectorAll<HTMLElement>(".screen")) el.hidden = el.id !== name;
  screen = name;
}

// Title: the first tap creates and unlocks the AudioContext, then the piano preloads. Taps
// unlock audio on pointerup/click only, so this listens to click, not pointerdown.
function begin(): void {
  if (screen !== "title") return;
  engine = new AudioEngine();
  engine.keySound = keySound;
  engine.ctx.addEventListener("statechange", () => {
    if (engine?.ctx.state !== "running") pause(); // phone call, lock screen, other app took audio
  });
  show("list");
  renderList();
  engine
    .loadPiano((f) => ($("progress-bar").style.width = `${Math.round(f * 100)}%`))
    .then(() => {
      $("progress-bar").parentElement!.hidden = true;
      renderList();
    })
    .catch((err: unknown) => {
      $("progress-bar").parentElement!.replaceWith(Object.assign(document.createElement("p"), { className: "hint", textContent: `Piano failed to load: ${err}` }));
    });
}
$("title").addEventListener("click", begin);

function renderList(): void {
  const list = $("pieces");
  list.replaceChildren(
    ...pieces.map((piece) => {
      const item = document.createElement("li");
      item.className = "piece";
      item.innerHTML = `<div class="composer"></div><div class="name"></div><div class="tiers"></div>`;
      item.querySelector(".composer")!.textContent = piece.composer;
      item.querySelector(".name")!.textContent = `${piece.title}, ${piece.opus}`;
      for (const tier of TIERS) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.tier = tier;
        button.disabled = !engine?.pianoReady;
        button.innerHTML = `${tier[0].toUpperCase()}${tier.slice(1)}<small>Level ${piece.tiers[tier].level}</small>`;
        button.addEventListener("click", () => startPlay(piece, tier));
        item.querySelector(".tiers")!.append(button);
      }
      return item;
    }),
  );
}

function startPlay(piece: Piece, tier: TierName): void {
  if (!engine) return;
  void engine.unlock(); // still inside the tap
  (document.activeElement as HTMLElement | null)?.blur(); // Space must not re-click the tier button
  if (!localStorage.getItem(HOWTO_KEY)) {
    pending = [piece, tier];
    return show("howto");
  }
  show("play");
  playfield.resize();
  $("paused").hidden = true;
  lanes.reset();
  const chart = buildChart(piece, tier, engine.keySound);
  const run = startRun(chart);
  const clock = engine.start(chart, run, manualClock);
  const play = new Play(chart, engine, { offset: AUDIO_OFFSET_MS, anyLane: tier === "easy" });
  session = { play, clock, run, piece, tier, frame: 0, pausedAt: null };
  frame();
  if (phoneLandscape.matches) pause();
}

function dismissHowto(): void {
  if (screen !== "howto" || !pending) return;
  localStorage.setItem(HOWTO_KEY, "1");
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
  playfield.draw(s.play, s.clock.now(), APPROACH_MS[s.tier], s.run.clicks);
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

// Rewinds about 2 s and counts in 3 beats. Judged notes stay judged; music picks up at the pause.
async function resume(): Promise<void> {
  const s = session;
  if (!s || s.pausedAt === null || !engine) return;
  await engine.unlock().catch(() => {});
  if (session !== s || s.pausedAt === null || phoneLandscape.matches) return;
  s.run = resumeRun(s.play.chart, s.pausedAt);
  s.clock = engine.start(s.play.chart, s.run, manualClock);
  s.play.resume(s.run.soundFrom);
  s.pausedAt = null;
  $("paused").hidden = true;
  (document.activeElement as HTMLElement | null)?.blur();
  frame();
}

function quit(): void {
  engine?.stop();
  session = null;
  show("list");
  renderList();
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
  $("result-piece").textContent = `${s.piece.title} · ${s.tier}`;
  $("grade").textContent = summary.grade;
  $("accuracy").textContent = `${summary.accuracy.toFixed(2)}%`;
  $("full-combo").hidden = !summary.fullCombo;
  const rows: [string, number][] = [
    ["Perfect", summary.counts.perfect],
    ["Great", summary.counts.great],
    ["Good", summary.counts.good],
    ["Miss", summary.counts.miss],
    ["Max combo", summary.maxCombo],
  ];
  $("counts").replaceChildren(
    ...rows.flatMap(([label, value]) => [
      Object.assign(document.createElement("dt"), { textContent: label }),
      Object.assign(document.createElement("dd"), { textContent: String(value) }),
    ]),
  );
  show("results");
}

$("back").addEventListener("click", () => show("list"));

// Input: lanes on the canvas, keys on the window. Both use the event timestamp.
const lanes = new LanePointers($("field"), {
  down: (lane, t) => session?.pausedAt === null && session.play.press(lane, session.clock.fromEvent(t)),
  up: (lane, t) => session?.pausedAt === null && session.play.release(lane, session.clock.fromEvent(t)),
});

window.addEventListener("keydown", (e) => {
  if (screen === "title") return begin();
  if (screen === "howto") return dismissHowto();
  if (screen === "results" && e.code === "Enter") return show("list");
  if (screen !== "play" || !session) return;
  if (e.code === "Escape") return void (session.pausedAt === null ? pause() : resume());
  const source = KEYS[e.code];
  if (source === undefined || session.pausedAt !== null) return;
  e.preventDefault();
  if (!e.repeat) session.play.press(source, session.clock.fromEvent(e.timeStamp));
});

window.addEventListener("keyup", (e) => {
  const source = KEYS[e.code];
  if (screen !== "play" || source === undefined || session?.pausedAt !== null) return;
  e.preventDefault();
  session.play.release(source, session.clock.fromEvent(e.timeStamp));
});

// Interruptions pause at once; coming back re-resumes the AudioContext (play stays paused).
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
  else if (engine && engine.ctx.state !== "running") void engine.ctx.resume().catch(() => {});
});
window.addEventListener("pagehide", pause);
window.addEventListener("blur", () => touchDevice.matches && pause());
const checkOrientation = () => {
  $("rotate").hidden = !phoneLandscape.matches;
  if (phoneLandscape.matches) pause();
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

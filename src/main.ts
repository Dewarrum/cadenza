// Screens: title -> piece list -> play -> results -> piece list.
import { AudioEngine, type Clock, ManualClock } from "./audio/engine.ts";
import { buildChart } from "./game/chart.ts";
import { Play, type Source } from "./game/play.ts";
import type { Summary } from "./game/score.ts";
import type { Piece, TierName } from "./piece.ts";
import { Playfield } from "./render/playfield.ts";

const modules = import.meta.glob<Piece>("../pieces/*.json", { eager: true, import: "default" });
const pieces = Object.entries(modules)
  .filter(([path]) => !path.endsWith(".overrides.json"))
  .map(([, piece]) => piece);

const TIERS: TierName[] = ["easy", "normal", "hard"];
const PLAYABLE: TierName[] = ["easy"]; // Normal and Hard arrive with the S3 generator
const APPROACH_MS: Record<TierName, number> = { easy: 1500, normal: 1200, hard: 1200 };
const AUDIO_OFFSET_MS = 0; // calibration arrives in S4
const KEYS: Record<string, Source> = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3, Space: "any" };

const params = new URLSearchParams(location.search);
const manualClock = params.get("clock") === "manual"; // e2e bot drives the song clock
const keySound = params.get("keysound") !== "off"; // settings screen arrives in S4

type Screen = "title" | "list" | "play" | "results";
type Session = { play: Play; clock: Clock; piece: Piece; tier: TierName; frame: number };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const playfield = new Playfield($<HTMLCanvasElement>("field"));
let screen: Screen = "title";
let engine: AudioEngine | null = null;
let session: Session | null = null;
let lastSummary: Summary | null = null;

function show(name: Screen): void {
  for (const el of document.querySelectorAll<HTMLElement>(".screen")) el.hidden = el.id !== name;
  screen = name;
}

// Title: the first gesture creates and unlocks the AudioContext, then the piano preloads.
function begin(): void {
  if (screen !== "title") return;
  engine = new AudioEngine();
  engine.keySound = keySound;
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
window.addEventListener("pointerdown", begin);

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
        button.disabled = !PLAYABLE.includes(tier) || !engine?.pianoReady;
        button.innerHTML = `${tier[0].toUpperCase()}${tier.slice(1)}<small>${PLAYABLE.includes(tier) ? `Level ${piece.tiers[tier].level}` : "soon"}</small>`;
        button.addEventListener("click", () => startPlay(piece, tier));
        item.querySelector(".tiers")!.append(button);
      }
      return item;
    }),
  );
}

function startPlay(piece: Piece, tier: TierName): void {
  if (!engine) return;
  (document.activeElement as HTMLElement | null)?.blur(); // Space must not re-click the tier button
  show("play");
  playfield.resize();
  const chart = buildChart(piece, tier, engine.keySound);
  const clock = engine.start(chart, manualClock);
  const play = new Play(chart, engine, { offset: AUDIO_OFFSET_MS, anyLane: tier === "easy" });
  session = { play, clock, piece, tier, frame: 0 };
  frame();
}

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
  if (!s || !tick(s)) return;
  playfield.draw(s.play, s.clock.now(), APPROACH_MS[s.tier]);
  s.frame = requestAnimationFrame(frame);
}

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

window.addEventListener("keydown", (e) => {
  if (screen === "title") return begin();
  if (screen === "results" && e.code === "Enter") return show("list");
  const source = KEYS[e.code];
  if (screen !== "play" || source === undefined || !session) return;
  e.preventDefault();
  if (!e.repeat) session.play.press(source, session.clock.fromEvent(e.timeStamp));
});

window.addEventListener("keyup", (e) => {
  const source = KEYS[e.code];
  if (screen !== "play" || source === undefined || !session) return;
  e.preventDefault();
  session.play.release(source, session.clock.fromEvent(e.timeStamp));
});

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
  chart: () => session?.play.chart.notes.map(({ time, lane, hold }) => ({ time, lane, hold })) ?? [],
  end: () => session?.play.chart.end ?? 0,
  judged: () => session?.play.results.filter((r) => r !== null) ?? [],
  now: () => session?.clock.now() ?? 0,
  // Manual clock only: jump the song clock to `ms` and run the game logic.
  advance(ms: number) {
    if (!session || !(session.clock instanceof ManualClock)) throw new Error("advance() needs ?clock=manual during play");
    session.clock.time = ms;
    tick(session);
  },
};

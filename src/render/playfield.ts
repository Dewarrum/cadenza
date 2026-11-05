// Canvas 2D play screen. Top to bottom: a header band (combo, count-in, the pause button), the
// highway where notes fall over a scrolling bar grid, the gilt judgement line, the fallboard
// strip where the judgement word shows (out of the notes' way, like the maker's name on a
// piano), and four ivory keys that light on press. The canvas fills its CSS box (the phone
// screen, or the phone-shaped column on wide screens) at device resolution. Every position is
// computed from the song clock and the current size, so resizing mid-song keeps notes in place.
//
// Drawing stays cheap: the static parts (background and vignette; line, fallboard and keys;
// the note, glow and lit-key sprites) are painted once per size into offscreen canvases and
// copied each frame. A frame adds only the grid lines, the notes and a few words: no gradient
// is created per frame and nothing uses shadowBlur.
import type { Chart } from "../game/chart.ts";
import type { Judgement } from "../game/judge.ts";
import type { Play } from "../game/play.ts";

export const HEADER_PX = 52; // matches the pause button band in style.css

const COLORS = {
  lacquer: "#0e0b09",
  ivory: "#f1e7d3",
  gilt: "#d3aa5c",
  parchment: "#a39884",
  felt: "#5a2a25",
  lane: "rgba(241, 231, 211, 0.022)",
  divider: "rgba(241, 231, 211, 0.05)",
  bar: "rgba(241, 231, 211, 0.16)",
  beat: "rgba(241, 231, 211, 0.055)",
  hold: "rgba(241, 231, 211, 0.3)",
  holding: "rgba(247, 228, 184, 0.62)",
  chord: "rgba(211, 170, 92, 0.65)",
  lineLit: "#f7dc9c",
};

const JUDGEMENT_STYLE: Record<Judgement, { label: string; color: string }> = {
  perfect: { label: "Perfect", color: "#e2bc6a" },
  great: { label: "Great", color: "#8fb3c6" },
  good: { label: "Good", color: "#b8b2a6" },
  miss: { label: "Miss", color: "#c97b6a" },
};

const SERIF = '"Bodoni Moda", Didot, Georgia, serif';
const SANS = '"Hanken Grotesk", system-ui, sans-serif';
const JUDGEMENT_MS = 500; // the judgement word fades out over this
const GLOW_MS = 160; // a released key's glow fades over this; at once with reduced motion
const MISSED_ALPHA = 0.22;

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

type Geometry = {
  w: number;
  h: number;
  top: number; // highway from here...
  lineY: number; // ...to the judgement line
  fallH: number;
  keysY: number;
  keysH: number;
  laneW: number;
  noteW: number;
  noteH: number;
  glowH: number;
  fadeH: number;
};

type Layers = Record<"base" | "keys" | "note" | "litKey" | "glow" | "fade", HTMLCanvasElement>;

function geometry(w: number, h: number): Geometry {
  const top = HEADER_PX;
  const keysH = Math.round(h * 0.115);
  const fallH = Math.round(Math.max(30, h * 0.045));
  const keysY = h - keysH;
  const lineY = keysY - fallH;
  const laneW = w / 4;
  return { w, h, top, lineY, fallH, keysY, keysH, laneW, noteW: laneW * 0.8, noteH: Math.max(12, Math.round(h * 0.02)), glowH: (lineY - top) * 0.3, fadeH: Math.min(64, (lineY - top) * 0.1) };
}

// An offscreen canvas of `w` x `h` CSS px at device resolution, painted once.
function layer(w: number, h: number, dpr: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
  const g = c.getContext("2d")!;
  g.scale(c.width / w, c.height / h);
  paint(g);
  return c;
}

// An ivory key seen from above: square at the back, rounded at the front.
function keyPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const r = Math.min(8, w * 0.09);
  g.beginPath();
  g.roundRect(x, y, w, h, [0, 0, r, r]);
}

function paintLayers(G: Geometry, dpr: number): Layers {
  const { w, h, top, lineY, fallH, keysH, laneW, noteW, noteH, glowH, fadeH } = G;

  const base = layer(w, h, dpr, (g) => {
    g.fillStyle = COLORS.lacquer;
    g.fillRect(0, 0, w, h);
    // The warm lamp low in the middle, then the lanes.
    const lamp = g.createRadialGradient(w / 2, lineY, 0, w / 2, lineY, h * 0.8);
    lamp.addColorStop(0, "rgba(160, 98, 44, 0.2)");
    lamp.addColorStop(0.45, "rgba(160, 98, 44, 0.07)");
    lamp.addColorStop(1, "rgba(160, 98, 44, 0)");
    g.fillStyle = lamp;
    g.fillRect(0, 0, w, h);
    g.fillStyle = COLORS.lane;
    for (const i of [1, 3]) g.fillRect(i * laneW, top, laneW, lineY - top);
    g.fillStyle = COLORS.divider;
    for (let i = 1; i < 4; i++) g.fillRect(i * laneW - 0.5, top, 1, lineY - top);
    // A quiet vignette, darker towards the edges and corners.
    g.save();
    g.translate(w / 2, h * 0.55);
    g.scale(1, h / w);
    const edge = g.createRadialGradient(0, 0, w * 0.35, 0, 0, w * 0.85);
    edge.addColorStop(0, "rgba(0, 0, 0, 0)");
    edge.addColorStop(1, "rgba(0, 0, 0, 0.5)");
    g.fillStyle = edge;
    g.fillRect(-w / 2, -w, w, 2 * w);
    g.restore();
    g.fillStyle = "rgba(241, 231, 211, 0.07)";
    g.fillRect(0, top - 1, w, 1);
  });

  // From 2 px above the line to the bottom: the line, the fallboard, the felt and the keys.
  const keys = layer(w, h - lineY + 2, dpr, (g) => {
    const y0 = 2;
    const keysY = y0 + fallH;
    g.fillStyle = "rgba(211, 170, 92, 0.16)";
    g.fillRect(0, 0, w, 4);
    const board = g.createLinearGradient(0, y0, 0, keysY);
    board.addColorStop(0, "#17130f");
    board.addColorStop(1, "#0b0907");
    g.fillStyle = board;
    g.fillRect(0, y0, w, fallH + keysH);
    g.fillStyle = "rgba(241, 231, 211, 0.05)";
    g.fillRect(0, y0 + 1, w, 1);
    g.fillStyle = COLORS.felt;
    g.fillRect(0, keysY - 3, w, 3);
    g.fillStyle = COLORS.gilt;
    g.fillRect(0, y0 - 0.75, w, 1.5);
    const ivory = g.createLinearGradient(0, keysY, 0, keysY + keysH);
    ivory.addColorStop(0, "#e9dfca");
    ivory.addColorStop(0.2, "#f2e9d7");
    ivory.addColorStop(0.9, "#efe5d1");
    ivory.addColorStop(1, "#d6c8ac");
    g.fillStyle = ivory;
    for (let i = 0; i < 4; i++) {
      keyPath(g, i * laneW + 1, keysY, laneW - 2, keysH - 1);
      g.fill();
    }
    const shade = g.createLinearGradient(0, keysY, 0, keysY + 12);
    shade.addColorStop(0, "rgba(0, 0, 0, 0.38)");
    shade.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = shade;
    g.fillRect(0, keysY, w, 12);
  });

  const litKey = layer(laneW, keysH, dpr, (g) => {
    const warm = g.createLinearGradient(0, 0, 0, keysH);
    warm.addColorStop(0, "#f2d79a");
    warm.addColorStop(0.25, "#fbe9bf");
    warm.addColorStop(0.9, "#f6dfa8");
    warm.addColorStop(1, "#dcbc78");
    g.fillStyle = warm;
    keyPath(g, 1, 0, laneW - 2, keysH - 1);
    g.fill();
    const shade = g.createLinearGradient(0, 0, 0, 12);
    shade.addColorStop(0, "rgba(60, 30, 0, 0.3)");
    shade.addColorStop(1, "rgba(60, 30, 0, 0)");
    g.fillStyle = shade;
    g.fillRect(0, 0, laneW, 12);
  });

  // The light a pressed key throws up its lane.
  const glow = layer(laneW, glowH, dpr, (g) => {
    const up = g.createLinearGradient(0, glowH, 0, 0);
    up.addColorStop(0, "rgba(240, 200, 120, 0.3)");
    up.addColorStop(0.35, "rgba(240, 200, 120, 0.09)");
    up.addColorStop(1, "rgba(240, 200, 120, 0)");
    g.fillStyle = up;
    g.fillRect(laneW * 0.04, 0, laneW * 0.92, glowH);
  });

  // A note: an ivory bar whose gilt bottom edge meets the gilt line on the beat.
  const note = layer(noteW, noteH, dpr, (g) => {
    g.beginPath();
    g.roundRect(0, 0, noteW, noteH, noteH * 0.36);
    g.clip();
    const body = g.createLinearGradient(0, 0, 0, noteH);
    body.addColorStop(0, "#fbf5e8");
    body.addColorStop(1, "#e6dbc4");
    g.fillStyle = body;
    g.fillRect(0, 0, noteW, noteH);
    const edge = Math.max(2, noteH * 0.2);
    g.fillStyle = COLORS.gilt;
    g.fillRect(0, noteH - edge, noteW, edge);
  });

  // Notes come up out of the dark under the header band.
  const fade = layer(w, fadeH, dpr, (g) => {
    const dark = g.createLinearGradient(0, 0, 0, fadeH);
    dark.addColorStop(0, "rgba(10, 8, 6, 0.95)");
    dark.addColorStop(1, "rgba(10, 8, 6, 0)");
    g.fillStyle = dark;
    g.fillRect(0, 0, w, fadeH);
  });

  return { base, keys, note, litKey, glow, fade };
}

// Notes of a chart that share an onset, two or more: drawn linked by a thin bar.
const chordCache = new WeakMap<Chart, number[][]>();
function chordsOf(chart: Chart): number[][] {
  let chords = chordCache.get(chart);
  if (!chords) {
    const groups: number[][] = [];
    chart.notes.forEach((n, i) => {
      const last = groups.at(-1);
      if (last && chart.notes[last[0]].time === n.time) last.push(i);
      else groups.push([i]);
    });
    chords = groups.filter((group) => group.length > 1);
    chordCache.set(chart, chords);
  }
  return chords;
}

export class Playfield {
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private G: Geometry = geometry(1, 1);
  private layers: Layers | null = null;
  private dpr = 0;
  private readonly litAt = [-Infinity, -Infinity, -Infinity, -Infinity]; // performance.now() a lane was last seen lit
  private readonly glowAlpha = [0, 0, 0, 0];
  private lastFrame: Parameters<Playfield["draw"]> | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d", { alpha: false })!;
    // Orientation, toolbar and window changes; a paused picture is redrawn at the new size. A
    // pixel ratio change without a size change (zoom, another screen) redraws too.
    const redraw = () => {
      this.resize();
      if (this.lastFrame) this.draw(...this.lastFrame);
    };
    new ResizeObserver(redraw).observe(canvas);
    const watchRatio = () =>
      matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener("change", () => (redraw(), watchRatio()), { once: true });
    watchRatio();
  }

  resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    if (this.layers && w === this.G.w && h === this.G.h && dpr === this.dpr) return;
    this.dpr = dpr;
    this.G = geometry(w, h);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.layers = paintLayers(this.G, dpr);
  }

  // `clicks` are the count-in beats of the current run.
  draw(play: Play, now: number, approachMs: number, clicks: readonly number[]): void {
    this.lastFrame = [play, now, approachMs, clicks];
    const L = this.layers;
    if (!L) return;
    const { g } = this;
    const { w, top, lineY, fallH, keysY, keysH, laneW, noteW, noteH, glowH, fadeH } = this.G;
    const y = (t: number) => lineY - ((t - now) / approachMs) * (lineY - top);

    g.drawImage(L.base, 0, 0, w, this.G.h);
    g.save();
    g.beginPath();
    g.rect(0, top, w, lineY - top);
    g.clip();

    // Bar lines and lighter beat lines, extended backwards through the count-in.
    const { bars, beats, beatMs, notes } = play.chart;
    const preBeats = Array.from({ length: 8 }, (_, i) => bars[0] - (i + 1) * beatMs);
    for (const [times, color] of [[[...preBeats, ...beats], COLORS.beat], [[bars[0] - 4 * beatMs, ...bars], COLORS.bar]] as const) {
      g.fillStyle = color;
      for (const t of times) {
        const ty = y(t);
        if (ty > top && ty < lineY) g.fillRect(0, ty, w, 1);
      }
    }

    // Pressed lanes glow; a released one fades (at once with reduced motion).
    const lit = play.litLanes();
    const clock = performance.now();
    for (let i = 0; i < 4; i++) {
      if (lit[i]) this.litAt[i] = clock;
      const a = lit[i] ? 1 : reducedMotion.matches ? 0 : 1 - (clock - this.litAt[i]) / GLOW_MS;
      this.glowAlpha[i] = Math.max(0, Math.min(1, a));
      if (this.glowAlpha[i] > 0) {
        g.globalAlpha = this.glowAlpha[i];
        g.drawImage(L.glow, i * laneW, lineY - glowH, laneW, glowH);
      }
    }
    g.globalAlpha = 1;

    // Chords: a thin gilt bar across the lanes of their notes still to play.
    g.fillStyle = COLORS.chord;
    for (const chord of chordsOf(play.chart)) {
      const ty = y(notes[chord[0]].time) - noteH / 2;
      if (ty < top - noteH || ty > lineY) continue;
      let lo = 4;
      let hi = -1;
      for (const i of chord) {
        if (play.states[i] !== "open") continue;
        lo = Math.min(lo, notes[i].lane);
        hi = Math.max(hi, notes[i].lane);
      }
      if (hi > lo) g.fillRect((lo + 0.5) * laneW, ty - 0.75, (hi - lo) * laneW, 1.5);
    }

    // Notes from far to near. A note's bottom edge is on the line at its time; a held note's
    // head stays on the line while its tail runs down into it. Hit notes vanish, missed ones
    // fall on dimmed and slide under the fallboard.
    const bandW = noteW * 0.34;
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      const state = play.states[i];
      const headY = state === "holding" ? lineY : y(n.time);
      if (headY < top) continue;
      const tailY = y(n.time + n.hold);
      if (Math.min(tailY, headY - noteH) > lineY) continue;
      const missed = state === "done";
      if (missed && play.results[i]?.judgement !== "miss") continue;
      const x = n.lane * laneW + (laneW - noteW) / 2;
      g.globalAlpha = missed ? MISSED_ALPHA : 1;
      if (n.hold > 0) {
        const from = Math.max(tailY, top - bandW);
        const to = headY - noteH / 2;
        if (to > from) {
          g.fillStyle = state === "holding" ? COLORS.holding : COLORS.hold;
          g.beginPath();
          g.roundRect(x + (noteW - bandW) / 2, from, bandW, to - from, [bandW / 2, bandW / 2, 0, 0]);
          g.fill();
        }
      }
      g.drawImage(L.note, x, headY - noteH, noteW, noteH);
    }
    g.globalAlpha = 1;
    g.restore();
    g.drawImage(L.fade, 0, top, w, fadeH);

    // Line, fallboard and keys; pressed keys lit, the line warmer above a glowing lane.
    g.drawImage(L.keys, 0, lineY - 2, w, this.G.h - lineY + 2);
    for (let i = 0; i < 4; i++) {
      if (lit[i]) g.drawImage(L.litKey, i * laneW, keysY, laneW, keysH);
      if (this.glowAlpha[i] > 0) {
        g.globalAlpha = this.glowAlpha[i];
        g.fillStyle = COLORS.lineLit;
        g.fillRect(i * laneW, lineY - 1, laneW, 2);
      }
    }
    g.globalAlpha = 1;

    // Words: the count-in in the header band, the combo at its left, the judgement on the
    // fallboard. None of them crosses the highway.
    g.textBaseline = "middle";
    const beat = clicks.findLastIndex((t) => t <= now);
    if (beat >= 0 && now < clicks[beat] + beatMs) {
      g.textAlign = "center";
      g.globalAlpha = 1 - 0.55 * ((now - clicks[beat]) / beatMs);
      g.fillStyle = COLORS.ivory;
      g.font = `400 ${Math.round(top * 0.62)}px ${SERIF}`;
      g.fillText(String(beat + 1), w / 2, top / 2 + 1);
      g.globalAlpha = 1;
    }
    if (play.combo >= 2) {
      g.textAlign = "left";
      const text = String(play.combo);
      g.font = `600 20px ${SANS}`;
      g.fillStyle = COLORS.ivory;
      g.fillText(text, 16, top / 2);
      const after = 16 + g.measureText(text).width + 6;
      g.font = `400 13px ${SANS}`;
      g.fillStyle = COLORS.parchment;
      g.fillText("combo", after, top / 2 + 1);
    }
    if (play.last && now - play.last.time < JUDGEMENT_MS) {
      const style = JUDGEMENT_STYLE[play.last.judgement];
      const p = (now - play.last.time) / JUDGEMENT_MS;
      g.textAlign = "center";
      g.globalAlpha = Math.max(0, 1 - p * p);
      g.fillStyle = style.color;
      g.font = `italic 400 ${Math.round(fallH * 0.62)}px ${SERIF}`;
      g.fillText(style.label, w / 2, lineY + fallH / 2);
      g.globalAlpha = 1;
    }
  }
}

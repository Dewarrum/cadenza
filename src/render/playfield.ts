// Canvas 2D play screen: four lanes ending in piano keys under a header band that holds the
// count-in and the pause button. The canvas fills its CSS box (the phone screen, or the
// phone-shaped column on wide screens) at device resolution. Every position is computed from
// the song clock and the current size, so resizing mid-song keeps notes in place.
import type { Judgement } from "../game/judge.ts";
import type { Play } from "../game/play.ts";

export const HEADER_PX = 52; // matches the pause button band in style.css

const COLORS = {
  bg: "#0b0908",
  lane: "rgba(255, 240, 220, 0.04)",
  bar: "rgba(255, 236, 200, 0.22)",
  beat: "rgba(255, 236, 200, 0.07)",
  note: "#f3ead8",
  hold: "rgba(243, 234, 216, 0.35)",
  missed: "rgba(243, 234, 216, 0.18)",
  key: "#efe6d2",
  keyLit: "#ffd98a",
  keyEdge: "#3a322a",
  line: "#d9b25f",
  text: "#f3ead8",
};

const JUDGEMENT_STYLE: Record<Judgement, { label: string; color: string }> = {
  perfect: { label: "Perfect", color: "#f0c060" },
  great: { label: "Great", color: "#f3ead8" },
  good: { label: "Good", color: "#a99f8f" },
  miss: { label: "Miss", color: "#8c5a50" },
};

export class Playfield {
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private lastFrame: Parameters<Playfield["draw"]> | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d")!;
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
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // `clicks` are the count-in beats of the current run.
  draw(play: Play, now: number, approachMs: number, clicks: readonly number[]): void {
    this.lastFrame = [play, now, approachMs, clicks];
    const { g, w, h } = this;
    const top = HEADER_PX;
    const keysH = h * 0.16;
    const lineY = h - keysH;
    const laneW = w / 4;
    const noteH = Math.max(10, h * 0.022);
    const y = (t: number) => lineY - ((t - now) / approachMs) * (lineY - top);

    // Background with a warm vignette.
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, w, h);
    const glow = g.createRadialGradient(w / 2, lineY, 0, w / 2, lineY, h * 0.9);
    glow.addColorStop(0, "rgba(120, 70, 30, 0.22)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.fillStyle = COLORS.lane;
    for (let i = 1; i < 4; i += 2) g.fillRect(i * laneW, top, laneW, lineY - top);

    // Grid and notes come in below the header band.
    g.save();
    g.beginPath();
    g.rect(0, top, w, h - top);
    g.clip();

    // Bar-line grid, extended backwards through the count-in.
    const { bars, beats, beatMs } = play.chart;
    const preBeats = Array.from({ length: 8 }, (_, i) => bars[0] - (i + 1) * beatMs);
    for (const [times, color] of [[[...preBeats, ...beats], COLORS.beat], [[bars[0] - 4 * beatMs, ...bars], COLORS.bar]] as const) {
      g.fillStyle = color;
      for (const t of times) {
        const ty = y(t);
        if (ty > top && ty < lineY) g.fillRect(0, ty, w, 1);
      }
    }

    // Notes, from far to near.
    const notes = play.chart.notes;
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      const state = play.states[i];
      const tail = y(n.time + n.hold);
      if (tail > h || y(n.time) < top - noteH) continue;
      const result = play.results[i];
      if (state === "done" && result?.judgement !== "miss") continue;
      const x = n.lane * laneW + laneW * 0.1;
      const nw = laneW * 0.8;
      const headY = state === "holding" ? lineY : y(n.time);
      if (n.hold > 0 && tail < headY) {
        g.fillStyle = state === "done" ? COLORS.missed : COLORS.hold;
        g.fillRect(x + nw * 0.3, tail, nw * 0.4, headY - tail);
      }
      g.fillStyle = state === "done" ? COLORS.missed : COLORS.note;
      g.beginPath();
      g.roundRect(x, headY - noteH / 2, nw, noteH, noteH / 3);
      g.fill();
    }
    g.restore();
    g.fillStyle = COLORS.beat;
    g.fillRect(0, top, w, 1);

    // Judgement line and keys.
    g.fillStyle = COLORS.line;
    g.fillRect(0, lineY - 1, w, 2);
    const lit = play.litLanes();
    for (let i = 0; i < 4; i++) {
      g.fillStyle = lit[i] ? COLORS.keyLit : COLORS.key;
      g.fillRect(i * laneW + 1, lineY + 2, laneW - 2, keysH - 2);
      g.fillStyle = COLORS.keyEdge;
      g.fillRect(i * laneW, lineY + 2, 1, keysH);
    }

    // Count-in in the header band, judgement, combo.
    g.textAlign = "center";
    g.textBaseline = "middle";
    const beat = clicks.findLastIndex((t) => t <= now);
    if (beat >= 0 && now < clicks[beat] + beatMs) {
      g.fillStyle = COLORS.text;
      g.font = `${Math.round(top * 0.7)}px Georgia, serif`;
      g.fillText(String(beat + 1), w / 2, top / 2);
    }
    if (play.last && now - play.last.time < 600) {
      const style = JUDGEMENT_STYLE[play.last.judgement];
      g.globalAlpha = 1 - (now - play.last.time) / 600;
      g.fillStyle = style.color;
      g.font = `${Math.round(h * 0.04)}px Georgia, serif`;
      g.fillText(style.label, w / 2, lineY - h * 0.12);
      g.globalAlpha = 1;
    }
    if (play.combo >= 2) {
      g.fillStyle = COLORS.text;
      g.font = `${Math.round(h * 0.03)}px Georgia, serif`;
      g.fillText(`${play.combo}`, w / 2, lineY - h * 0.2);
    }
  }
}

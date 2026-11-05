// Canvas 2D play screen: a phone-shaped column with four lanes ending in piano keys.
// Every position is computed from the song clock, so the picture follows the audio.
import type { Judgement } from "../game/judge.ts";
import type { Play } from "../game/play.ts";

export const ASPECT = 9 / 19.5; // width / height of the play column

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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.g = canvas.getContext("2d")!;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize(): void {
    const h = window.innerHeight;
    const w = Math.min(window.innerWidth, Math.round(h * ASPECT));
    const dpr = window.devicePixelRatio || 1;
    this.w = w;
    this.h = h;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(play: Play, now: number, approachMs: number): void {
    const { g, w, h } = this;
    const keysH = h * 0.16;
    const lineY = h - keysH;
    const laneW = w / 4;
    const noteH = Math.max(10, h * 0.022);
    const y = (t: number) => lineY - ((t - now) / approachMs) * lineY;

    // Background with a warm vignette.
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, w, h);
    const glow = g.createRadialGradient(w / 2, lineY, 0, w / 2, lineY, h * 0.9);
    glow.addColorStop(0, "rgba(120, 70, 30, 0.22)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.fillStyle = COLORS.lane;
    for (let i = 1; i < 4; i += 2) g.fillRect(i * laneW, 0, laneW, lineY);

    // Bar-line grid, extended backwards through the count-in.
    const { bars, beats, beatMs } = play.chart;
    const preBeats = Array.from({ length: 8 }, (_, i) => bars[0] - (i + 1) * beatMs);
    for (const [times, color] of [[[...preBeats, ...beats], COLORS.beat], [[bars[0] - 4 * beatMs, ...bars], COLORS.bar]] as const) {
      g.fillStyle = color;
      for (const t of times) {
        const ty = y(t);
        if (ty > -2 && ty < lineY) g.fillRect(0, ty, w, 1);
      }
    }

    // Notes, from far to near.
    const notes = play.chart.notes;
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      const state = play.states[i];
      const top = y(n.time + n.hold);
      if (top > h || y(n.time) < -noteH) continue;
      const result = play.results[i];
      if (state === "done" && result?.judgement !== "miss") continue;
      const x = n.lane * laneW + laneW * 0.1;
      const nw = laneW * 0.8;
      const headY = state === "holding" ? lineY : y(n.time);
      if (n.hold > 0 && top < headY) {
        g.fillStyle = state === "done" ? COLORS.missed : COLORS.hold;
        g.fillRect(x + nw * 0.3, top, nw * 0.4, headY - top);
      }
      g.fillStyle = state === "done" ? COLORS.missed : COLORS.note;
      g.beginPath();
      g.roundRect(x, headY - noteH / 2, nw, noteH, noteH / 3);
      g.fill();
    }

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

    // Count-in, judgement, combo.
    g.textAlign = "center";
    g.textBaseline = "middle";
    const countInStart = bars[0] - 4 * beatMs;
    if (now >= countInStart && now < bars[0]) {
      g.fillStyle = COLORS.text;
      g.font = `${Math.round(h * 0.08)}px Georgia, serif`;
      g.fillText(String(Math.floor((now - countInStart) / beatMs) + 1), w / 2, h * 0.35);
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

// Calibration screen: four count-in clicks, then sixteen at 100 bpm, through the same output
// path as the piano; the player taps on each. A tap's time is its event timestamp mapped onto
// the audio clock inside the handler, exactly as during play, so the median delay is the
// offset the judge has to subtract. Backgrounding or a suspended context stops the run.
import { AudioClock, type AudioEngine } from "../audio/engine.ts";
import { CALIBRATION, calibrate, tapDeltas } from "../game/calibration.ts";

export type CalibrationDeps = {
  engine(): AudioEngine | null;
  latencyMs(): number;
  apply(audioOffsetMs: number): void;
  close(): void;
};

const LEAD_MS = 600; // silence before the first click

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function calibrationScreen(deps: CalibrationDeps) {
  const { countIn, clicks: count, intervalMs } = CALIBRATION;
  const clickTimes = Array.from({ length: countIn + count }, (_, i) => i * intervalMs);
  const measured = clickTimes.slice(countIn);
  let run: { clock: AudioClock; taps: number[]; frame: number } | null = null;
  let result: number | null = null;

  const status = (text: string, detail = "") => {
    $("cal-status").textContent = text;
    $("cal-count").textContent = detail;
  };

  function idle(text: string, detail = "Tap here to start"): void {
    run = null;
    $("cal-pad").classList.remove("running");
    status(text, detail);
  }

  async function start(): Promise<void> {
    const engine = deps.engine();
    if (!engine || run) return;
    result = null;
    $("cal-result").hidden = true;
    await engine.unlock().catch(() => {});
    if (engine.ctx.state !== "running") return idle("Audio is not running", "Tap here to try again");
    engine.stop();
    const clock = new AudioClock(engine.ctx, -LEAD_MS);
    clickTimes.forEach((t, i) => engine.click(clock.toAudio(t), i >= countIn));
    run = { clock, taps: [], frame: 0 };
    $("cal-pad").classList.add("running");
    tick();
  }

  function tick(): void {
    if (!run) return;
    const now = run.clock.now();
    const beat = clickTimes.findLastIndex((t) => t <= now);
    if (beat < countIn) status(beat < 0 ? "Listen" : String(beat + 1), "count-in");
    else status("Tap", `${run.taps.length} / ${count} taps`);
    if (now > measured.at(-1)! + intervalMs) return finish();
    run.frame = requestAnimationFrame(tick);
  }

  function finish(): void {
    const deltas = tapDeltas(run!.taps, measured);
    const outcome = calibrate(deltas);
    if (!outcome) return idle(deltas.length < CALIBRATION.minTaps ? `Only ${deltas.length} of ${count} clicks had a tap` : "Taps too scattered to measure", "Tap here to try again");
    idle("", "");
    result = outcome.offsetMs;
    const ms = Math.abs(result);
    const latency = deps.latencyMs();
    status(
      result === 0 ? "You tap right on the click" : `You tap ${ms} ms ${result > 0 ? "late" : "early"}`,
      `Offset ${latency + result} ms (${latency} ms device latency ${result < 0 ? "−" : "+"} ${ms} ms)${outcome.dropped ? ` · ${outcome.dropped} stray taps ignored` : ""}`,
    );
    $("cal-result").hidden = false;
  }

  // A tap at event time `timeStamp`, read off the audio clock right here in the handler.
  function tap(timeStamp: number): void {
    if (result !== null) return; // Apply or Retry
    if (!run) return void start();
    if (deps.engine()?.ctx.state !== "running") return stop();
    run.taps.push(run.clock.fromEvent(timeStamp));
    $("cal-pad").animate([{ background: "rgba(217, 178, 95, 0.25)" }, { background: "transparent" }], 150);
  }

  // Stops a run at once: clicks silenced, nothing measured.
  function stop(): void {
    if (!run) return;
    cancelAnimationFrame(run.frame);
    deps.engine()?.stop();
    idle("Stopped", "Tap here to start again");
  }

  $("cal-pad").addEventListener("pointerdown", (e) => tap(e.timeStamp));
  $("cal-apply").addEventListener("click", () => result !== null && (deps.apply(result), deps.close()));
  $("cal-retry").addEventListener("click", () => void start());
  $("cal-cancel").addEventListener("click", () => (stop(), deps.close()));

  return {
    open(): void {
      result = null;
      $("cal-result").hidden = true;
      idle("Ready");
    },
    stop,
    key(e: KeyboardEvent): void {
      if (e.code === "Escape") return stop(), deps.close();
      e.preventDefault();
      if (!e.repeat) tap(e.timeStamp);
    },
  };
}

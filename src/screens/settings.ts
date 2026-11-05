// Settings screen. Every change goes through `change`, which saves and applies it at once.
import { APPROACH_RANGE, clampOffset, keyLabel, OFFSET_RANGE, rebind, type Settings } from "../settings.ts";

export type SettingsDeps = {
  get(): Settings;
  change(patch: Partial<Settings>): void;
  latencyMs(): number; // output latency the browser reports, already compensated by the clock
  calibrate(): void;
  clearResults(): void;
  back(): void;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const seconds = (ms: number) => `${(ms / 1000).toFixed(2).replace(/0$/, "")} s`;

export function settingsScreen(deps: SettingsDeps) {
  let binding: number | null = null; // lane waiting for a key
  const approach = $<HTMLInputElement>("approach");
  Object.assign(approach, { min: APPROACH_RANGE.min, max: APPROACH_RANGE.max, step: APPROACH_RANGE.step });
  const note = (id: string, text: string) => Object.assign($(id), { textContent: text, hidden: false });

  function render(): void {
    const s = deps.get();
    // Shown: the whole offset, i.e. the reported output latency (the starting value) plus what
    // calibration or the stepper added on top. Positive = taps land after the sound.
    const latency = deps.latencyMs();
    const extra = s.audioOffsetMs ?? 0;
    $("offset-value").textContent = `${latency + extra} ms`;
    $("offset-note").textContent =
      s.audioOffsetMs === null
        ? `Starting value: the ${latency} ms output latency your device reports. Calibrate to measure yours.`
        : `${latency} ms device latency ${extra < 0 ? "−" : "+"} ${Math.abs(extra)} ms measured. Positive: your taps land after the sound.`;
    $<HTMLButtonElement>("offset-down").disabled = extra <= OFFSET_RANGE.min;
    $<HTMLButtonElement>("offset-up").disabled = extra >= OFFSET_RANGE.max;
    approach.value = String(s.approachMs ?? 1200);
    $("approach-value").textContent = s.approachMs === null ? "Easy 1.5 s, Normal and Hard 1.2 s" : `${seconds(s.approachMs)}, all tiers`;
    $<HTMLInputElement>("volume").value = String(Math.round(s.volume * 100));
    $("volume-value").textContent = `${Math.round(s.volume * 100)}%`;
    $<HTMLInputElement>("keysound").checked = s.keySound;
    $("keys").replaceChildren(
      ...s.keys.map((code, lane) => {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.lane = String(lane);
        b.className = binding === lane ? "binding" : "";
        b.textContent = binding === lane ? "…" : keyLabel(code);
        b.addEventListener("click", () => {
          binding = binding === lane ? null : lane;
          $("keys-note").textContent = binding === null ? "Click a lane, then press a key" : `Press a key for lane ${lane + 1} (Esc cancels)`;
          render();
        });
        return b;
      }),
    );
  }

  const stepOffset = (by: number) => deps.change({ audioOffsetMs: clampOffset((deps.get().audioOffsetMs ?? 0) + by) });
  $("offset-down").addEventListener("click", () => stepOffset(-OFFSET_RANGE.step));
  $("offset-up").addEventListener("click", () => stepOffset(OFFSET_RANGE.step));
  $("calibrate").addEventListener("click", () => deps.calibrate());
  approach.addEventListener("input", () => deps.change({ approachMs: Number(approach.value) }));
  $("approach-reset").addEventListener("click", () => deps.change({ approachMs: null }));
  $("volume").addEventListener("input", (e) => deps.change({ volume: Number((e.target as HTMLInputElement).value) / 100 }));
  $("keysound").addEventListener("change", (e) => deps.change({ keySound: (e.target as HTMLInputElement).checked }));
  $("howto-again").addEventListener("click", () => {
    deps.change({ howtoSeen: false });
    note("settings-note", "The how-to card shows before your next play.");
  });
  $("clear-results").addEventListener("click", () => {
    if (!confirm("Clear all best results?")) return;
    deps.clearResults();
    note("settings-note", "All results cleared.");
  });
  $("settings-back").addEventListener("click", () => deps.back());

  return {
    open(): void {
      binding = null;
      $("keys-note").textContent = "Click a lane, then press a key";
      $("settings-note").hidden = true;
      render();
    },
    render,
    // Keys while the settings screen shows: the lane being rebound takes the next key.
    key(e: KeyboardEvent): void {
      if (binding === null) {
        if (e.code === "Escape") deps.back();
        return;
      }
      e.preventDefault();
      const lane = binding;
      if (e.code === "Escape") {
        binding = null;
        $("keys-note").textContent = "Click a lane, then press a key";
        return render();
      }
      const keys = rebind(deps.get().keys, lane, e.code);
      if (typeof keys === "string") {
        $("keys-note").textContent = `${keys}. Press another key for lane ${lane + 1}.`;
        return;
      }
      binding = null;
      $("keys-note").textContent = `Lane ${lane + 1} is now ${keyLabel(e.code)}`;
      deps.change({ keys });
    },
  };
}

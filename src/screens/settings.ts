// Settings screen. Every change goes through `change`, which saves and applies it at once.
import type { TierName } from "../piece.ts";
import { APPROACH_RANGE, approachFor, clampOffset, keyLabel, OFFSET_RANGE, rebind, type Settings } from "../settings.ts";

export type SettingsDeps = {
  get(): Settings;
  change(patch: Partial<Settings>): void;
  latencyMs(): number; // output latency the browser reports, already compensated by the clock
  tier(): TierName | null; // the tier being played or last played, if any
  calibrate(): void;
  clearResults(): void;
  back(): void;
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const seconds = (ms: number) => `${(ms / 1000).toFixed(2).replace(/0$/, "")} s`;

// Sliders paint their track up to the thumb from --fill.
function fill(range: HTMLInputElement): void {
  const [min, max, value] = [range.min, range.max, range.value].map(Number);
  range.style.setProperty("--fill", `${((value - min) / (max - min)) * 100}%`);
}

export function settingsScreen(deps: SettingsDeps) {
  let binding: number | null = null; // lane waiting for a key
  const approach = $<HTMLInputElement>("approach");
  const volume = $<HTMLInputElement>("volume");
  const confirm = $<HTMLDialogElement>("confirm");
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
    // Approach time: per tier (no override) or one time for all tiers, an explicit choice. The
    // slider shows only for the one time, so it never sits at a value that is not in effect.
    const tier = deps.tier();
    const perTier = s.approachMs === null;
    $<HTMLInputElement>("approach-reset").checked = perTier;
    $<HTMLInputElement>("approach-all").checked = !perTier;
    approach.hidden = perTier;
    approach.value = String(approachFor(s, tier ?? "easy"));
    fill(approach);
    $("approach-value").textContent = perTier ? (tier ? `${seconds(approachFor(s, tier))} on ${tier[0].toUpperCase()}${tier.slice(1)}` : "") : seconds(s.approachMs!);
    $("approach-note").textContent = perTier ? "Easy 1.5 s, Normal and Hard 1.2 s" : "The same time on every tier";
    volume.value = String(Math.round(s.volume * 100));
    fill(volume);
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
  $("approach-reset").addEventListener("change", () => deps.change({ approachMs: null }));
  // "Same for all" starts from the time in effect for the tier being (or last) played.
  $("approach-all").addEventListener("change", () => deps.change({ approachMs: approachFor(deps.get(), deps.tier() ?? "easy") }));
  volume.addEventListener("input", () => deps.change({ volume: Number(volume.value) / 100 }));
  $("keysound").addEventListener("change", (e) => deps.change({ keySound: (e.target as HTMLInputElement).checked }));
  $("howto-again").addEventListener("click", () => {
    deps.change({ howtoSeen: false });
    note("settings-note", "The how-to card shows before your next play.");
  });
  // Clear all results asks first, in an in-app dialog (Esc or Cancel keeps them).
  $("clear-results").addEventListener("click", () => {
    confirm.returnValue = "";
    confirm.showModal();
  });
  confirm.addEventListener("close", () => {
    if (confirm.returnValue !== "clear") return;
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
      if (confirm.open) return; // the dialog handles its own keys
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

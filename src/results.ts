// Best result per piece and tier, kept in localStorage under one versioned key.
import type { Grade, Summary } from "./game/score.ts";
import type { TierName } from "./piece.ts";

export const RESULTS_KEY = "cadenza.results.v1";

// The best run's accuracy, grade and date; a full combo and the max combo count from any run.
export type Best = { accuracy: number; grade: Grade; fullCombo: boolean; maxCombo: number; date: string; plays: number };
export type Results = Record<string, Partial<Record<TierName, Best>>>; // piece id -> tier -> best

// A run is a new best when it beats the previous best accuracy (or is the first).
export function mergeBest(prev: Best | undefined, run: Summary, date: string): { best: Best; isNew: boolean } {
  const isNew = !prev || run.accuracy > prev.accuracy;
  const top = isNew ? { accuracy: run.accuracy, grade: run.grade, date } : { accuracy: prev.accuracy, grade: prev.grade, date: prev.date };
  return {
    isNew,
    best: { ...top, fullCombo: !!prev?.fullCombo || run.fullCombo, maxCombo: Math.max(prev?.maxCombo ?? 0, run.maxCombo), plays: (prev?.plays ?? 0) + 1 },
  };
}

export function loadResults(): Results {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RESULTS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Results) : {};
  } catch {
    return {};
  }
}

// Records a finished run; returns the new best and the best before this run.
export function recordResult(pieceId: string, tier: TierName, run: Summary): { best: Best; previous: Best | undefined; isNew: boolean } {
  const results = loadResults();
  const previous = results[pieceId]?.[tier];
  const { best, isNew } = mergeBest(previous, run, new Date().toISOString());
  results[pieceId] = { ...results[pieceId], [tier]: best };
  try {
    localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
  } catch {
    // storage full or blocked: the results screen still shows the comparison
  }
  return { best, previous, isNew };
}

export function clearResults(): void {
  localStorage.removeItem(RESULTS_KEY);
}

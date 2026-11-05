// Scoring = accuracy. Pure functions over per-note results in chart order.
import { HOLD_OK, type Judgement } from "./judge.ts";

export const VALUES: Record<Judgement, number> = { perfect: 1, great: 0.7, good: 0.4, miss: 0 };

export type NoteResult = { judgement: Judgement; holdFraction?: number }; // holdFraction only for holds

export type Grade = "S" | "A" | "B" | "C" | "D";

export type Summary = {
  accuracy: number; // 0-100
  grade: Grade;
  counts: Record<Judgement, number>;
  brokenHolds: number;
  maxCombo: number;
  fullCombo: boolean;
};

export const isBroken = (r: NoteResult) => r.holdFraction !== undefined && r.holdFraction < HOLD_OK;

// A broken hold keeps only the held fraction of its head's value.
export function noteValue(r: NoteResult): number {
  const value = VALUES[r.judgement];
  return isBroken(r) ? value * r.holdFraction! : value;
}

export function grade(accuracy: number): Grade {
  if (accuracy >= 95) return "S";
  if (accuracy >= 90) return "A";
  if (accuracy >= 80) return "B";
  if (accuracy >= 65) return "C";
  return "D";
}

// `results` has one entry per chart note; unjudged notes (null) count as misses.
export function summarize(results: readonly (NoteResult | null)[]): Summary {
  const counts: Record<Judgement, number> = { perfect: 0, great: 0, good: 0, miss: 0 };
  let sum = 0;
  let combo = 0;
  let maxCombo = 0;
  let brokenHolds = 0;
  for (const r of results) {
    const result = r ?? { judgement: "miss" };
    counts[result.judgement]++;
    sum += noteValue(result);
    if (isBroken(result)) brokenHolds++;
    combo = result.judgement === "miss" || isBroken(result) ? 0 : combo + 1;
    maxCombo = Math.max(maxCombo, combo);
  }
  const accuracy = results.length ? (sum / results.length) * 100 : 0;
  return {
    accuracy,
    grade: grade(accuracy),
    counts,
    brokenHolds,
    maxCombo,
    fullCombo: results.length > 0 && counts.miss === 0 && brokenHolds === 0,
  };
}

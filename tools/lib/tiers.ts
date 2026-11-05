// Chart generation for the three tiers (DESIGN.md "Tier rules"). Each tier runs the same steps:
// candidates (which notes of each onset the tier may chart) -> overrides -> thinning to the
// density cap -> lanes by pitch rank -> same-lane collisions, lane limit and holds -> level.
// Times are ms at tempo 1.0; caps and gaps are in played time, so they scale with the tempo factor.
import type { ChartNote, Hand, Tier, TierName } from "../../src/piece.ts";
import { assignLanes, LANES } from "./lanes.ts";

export type Note = { id: string; pitch: number; start: number; duration: number; hand: Hand };
export type Grid = { bars: number[]; beats: number[] };

export const RULES = {
  ornamentMs: 80, // grace notes and ornaments shorter than this are never charted
  sameOnsetMs: 30, // onsets this close form one chord onset
  holdBeats: 1, // notes at least this many beats long become holds...
  holdGapMs: 150, // ...ending this long before the next note in their lane or their hand
  laneGapMs: 120, // no two notes in one lane closer than this
  minHoldMs: 500, // shorter holds are taps
  forcedHoldMs: 250, // a forceHold override stays a hold down to this length
  laneWindowMs: 2000, // pitch-rank window for lanes
};

// Density cap: at most maxNotes chart notes (chord notes count singly) in any windowMs, onsets at
// least minGapMs apart, at most `lanes` lanes in use at once (chord notes plus holds still down).
// Chords take up to `lanes` notes on a beat and up to `offbeat` notes between beats.
export const TIERS: Record<TierName, { maxNotes: number; windowMs: number; minGapMs: number; lanes: number; offbeat: number }> = {
  easy: { maxNotes: 2, windowMs: 1000, minGapMs: 300, lanes: 1, offbeat: 1 },
  normal: { maxNotes: 8, windowMs: 2000, minGapMs: 180, lanes: 2, offbeat: 1 },
  hard: { maxNotes: 13, windowMs: 2000, minGapMs: 100, lanes: 3, offbeat: 2 },
};

export type TierOverrides = {
  tempoFactor?: number;
  include?: string[]; // charted on this tier whatever the rules say
  exclude?: string[]; // never charted on this tier
  drop?: string[]; // never charted on any tier
  lanes?: Record<string, number>; // pinned lanes
  forceHold?: string[]; // holds even when shorter than a beat
};

export type TierStats = {
  notes: number;
  avg: number; // notes per second of played time, first to last onset
  peak: number; // most notes in any 4 s of played time, per second
  chords: number; // chord onsets
  chordNotes: number;
  holds: number;
  lanes: number[]; // notes per lane
  shifted: number; // onsets moved sideways to keep a lane clear
  holdCuts: number; // holds shortened for a note in their lane or the lane limit
};

export type TierResult = { tier: Tier; stats: TierStats; warnings: string[] };

type Group = { time: number; notes: Note[]; strength: number }; // notes in priority order

const POSITION_STRENGTH = { bar: 3, mid: 2.5, beat: 2, sub: 1, off: 0 };
// The other notes of a chord rank below its first note. Order of the thinning classes: first
// notes on bar lines, middle beats, beats; then chord notes on bar lines and middle beats; then
// first notes between beats; then chord notes on other beats.
const CHORD_NOTE_PENALTY = 1.25;

// Metric position of a time: bar line, middle beat of a bar with an even beat count (beat 3 in
// 4/4 and 12/8), other beat, half or third of a beat, or anything else.
function position({ bars, beats }: Grid, t: number): keyof typeof POSITION_STRENGTH {
  const tol = RULES.sameOnsetMs;
  const i = beats.findLastIndex((b) => b <= t + tol);
  if (i < 0) return "off";
  if (t - beats[i] <= tol) {
    const bar = bars.findLastIndex((b) => b <= t + tol);
    if (bar < 0) return "beat";
    if (t - bars[bar] <= tol) return "bar";
    const inBar = beats.filter((b) => b >= bars[bar] - tol && b < (bars[bar + 1] ?? Infinity) - tol);
    return inBar.length % 2 === 0 && Math.abs(inBar[inBar.length / 2] - beats[i]) <= tol ? "mid" : "beat";
  }
  const len = i + 1 < beats.length ? beats[i + 1] - beats[i] : beats[i] - beats[i - 1];
  return [1 / 2, 1 / 3, 2 / 3].some((f) => Math.abs(t - beats[i] - f * len) <= tol) ? "sub" : "off";
}

export function beatLengthAt(beats: number[], t: number): number {
  const i = beats.findLastIndex((b) => b <= t + RULES.sameOnsetMs);
  const j = Math.min(Math.max(i, 0), beats.length - 2);
  return beats[j + 1] - beats[j];
}

// Notes starting within sameOnsetMs of the first note of an onset belong to it.
function onsets(notes: Note[]): Note[][] {
  const out: Note[][] = [];
  for (const n of [...notes].sort((a, b) => a.start - b.start || b.pitch - a.pitch)) {
    const last = out.at(-1);
    if (last && n.start - last[0].start <= RULES.sameOnsetMs) last.push(n);
    else out.push([n]);
  }
  return out;
}

// Skyline: a note belongs to the top voice unless a higher note is already sounding at its onset.
function topVoice(notes: Note[]): Set<Note> {
  const tol = RULES.sameOnsetMs;
  return new Set(
    notes.filter((n) => !notes.some((m) => m.pitch > n.pitch && m.start <= n.start + tol && m.start + m.duration > n.start + tol)),
  );
}

const distinctPitches = (notes: Note[]) => notes.filter((n, i) => notes.findIndex((m) => m.pitch === n.pitch) === i);

// What each tier may chart at one onset, most important note first (the first ones survive
// when the density cap leaves room for only part of a chord):
//   Easy: the right hand's top voice.
//   Normal: top two right-hand notes; the lowest left-hand note on bar lines (before the second
//     right-hand note) and on the middle beat (after it, so only when the right hand is single).
//   Hard: top two right-hand notes and the lowest left-hand note, or the top three right-hand
//     notes when the left hand is silent.
// Between beats Normal charts single notes and Hard at most two (see TIERS).
function candidates(name: TierName, notes: Note[], grid: Grid): Group[] {
  const melody = topVoice(notes.filter((n) => n.hand === "R"));
  return onsets(notes).flatMap((onset) => {
    const time = onset[0].start;
    const pos = position(grid, time);
    const rh = onset.filter((n) => n.hand === "R").sort((a, b) => b.pitch - a.pitch);
    const lh = onset.filter((n) => n.hand === "L").sort((a, b) => a.pitch - b.pitch);
    const picks =
      name === "easy"
        ? rh.slice(0, 1).filter((n) => melody.has(n))
        : name === "normal"
          ? pos === "bar" ? [rh[0], lh[0], rh[1]] : pos === "mid" ? [rh[0], rh[1], lh[0]] : rh.slice(0, 2)
          : lh.length > 0 ? [rh[0], lh[0], rh[1]] : rh.slice(0, 3);
    const size = POSITION_STRENGTH[pos] >= POSITION_STRENGTH.beat ? TIERS[name].lanes : TIERS[name].offbeat;
    const chosen = distinctPitches(picks.filter(Boolean)).slice(0, size);
    if (chosen.length === 0) return [];
    return [{ time, notes: chosen, strength: POSITION_STRENGTH[pos] }];
  });
}

const lowerBound = (a: number[], t: number) => {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};
const insertSorted = (a: number[], t: number) => a.splice(lowerBound(a, t), 0, t);
const nearest = (a: number[], t: number) => {
  const i = lowerBound(a, t);
  return Math.min(i < a.length ? a[i] - t : Infinity, i > 0 ? t - a[i - 1] : Infinity);
};

// Greedy thinning to the cap, note by note. Forced notes go in first, then by metric strength
// (bar lines, middle beats, beats, halves and thirds of beats), a chord's other notes ranking
// below its first one; longer notes first. Within a class the note farthest from everything
// chosen so far goes next, so a passage over the cap keeps an even spread. A chord note only
// goes in after the notes before it in its onset.
function thin(groups: Group[], cap: { maxNotes: number; windowMs: number; minGapMs: number }, forced: Set<string>): Group[] {
  const times: number[] = []; // chosen note times, one per note
  const chosenOnsets: number[] = [];
  const chosen = new Map<Group, Set<Note>>();

  const windowOk = (t: number) => {
    const at = lowerBound(times, t);
    const get = (i: number) => (i < at ? times[i] : i === at ? t : times[i - 1]);
    const m = cap.maxNotes;
    for (let j = Math.max(0, at - m); j <= at && j + m <= times.length; j++) {
      if (get(j + m) - get(j) < cap.windowMs) return false;
    }
    return true;
  };
  const add = (g: Group, n: Note) => {
    if (!chosen.has(g)) {
      chosen.set(g, new Set());
      insertSorted(chosenOnsets, g.time);
    }
    chosen.get(g)!.add(n);
    insertSorted(times, g.time);
  };

  type Pick = { g: Group; rank: number; priority: number; duration: number };
  const picks: Pick[] = [];
  for (const g of groups) {
    g.notes.forEach((n, rank) => {
      if (forced.has(n.id)) add(g, n);
      else picks.push({ g, rank, priority: g.strength - (rank > 0 ? CHORD_NOTE_PENALTY : 0), duration: Math.round(n.duration / 10) });
    });
  }
  const classes = new Map<string, Pick[]>();
  for (const p of picks.sort((a, b) => b.priority - a.priority || b.duration - a.duration)) {
    const key = `${p.priority}/${p.duration}`;
    classes.set(key, [...(classes.get(key) ?? []), p]);
  }
  for (const pool of classes.values()) {
    const mine: number[] = [];
    while (pool.length > 0) {
      let best = 0;
      let bestKey = [-1, -1, 0];
      pool.forEach((p, i) => {
        const key = [nearest(chosenOnsets, p.g.time), nearest(mine, p.g.time), -p.rank];
        if (key[0] > bestKey[0] || (key[0] === bestKey[0] && (key[1] > bestKey[1] || (key[1] === bestKey[1] && key[2] > bestKey[2])))) {
          [best, bestKey] = [i, key];
        }
      });
      const [{ g, rank }] = pool.splice(best, 1);
      const have = chosen.get(g);
      if (rank > 0 && !have?.has(g.notes[rank - 1])) continue;
      if (!have && nearest(chosenOnsets, g.time) < cap.minGapMs) continue;
      if (!windowOk(g.time)) continue;
      add(g, g.notes[rank]);
      insertSorted(mine, g.time);
    }
  }
  return groups
    .filter((g) => chosen.has(g))
    .map((g) => ({ ...g, notes: [...chosen.get(g)!].sort((a, b) => a.pitch - b.pitch) }));
}

type Placed = { note: Note; lane: number; holdEnd: number | null; forcedHold: boolean };

export function makeTier(name: TierName, all: Note[], grid: Grid, o: TierOverrides = {}): TierResult {
  const rule = TIERS[name];
  const tempoFactor = o.tempoFactor ?? 1;
  const scale = tempoFactor; // played ms = raw ms / tempoFactor
  const warnings: string[] = [];
  const out = new Set([...(o.drop ?? []), ...(o.exclude ?? [])]);
  const include = new Set(o.include ?? []);
  const forceHold = new Set(o.forceHold ?? []);
  const pins = new Map(Object.entries(o.lanes ?? {}));

  // Candidates, minus dropped and excluded notes, plus included ones (first in their onset).
  const playable = all.filter((n) => n.duration >= RULES.ornamentMs || include.has(n.id));
  let groups = candidates(name, playable, grid);
  for (const id of include) {
    const n = all.find((m) => m.id === id)!;
    const g = groups.find((x) => Math.abs(x.time - n.start) <= RULES.sameOnsetMs);
    if (!g) groups.push({ time: n.start, notes: [n], strength: POSITION_STRENGTH[position(grid, n.start)] });
    else if (!g.notes.includes(n)) g.notes = [n, ...g.notes].slice(0, rule.lanes);
  }
  groups = groups
    .map((g) => ({ ...g, notes: g.notes.filter((n) => !out.has(n.id)) }))
    .filter((g) => g.notes.length > 0)
    .sort((a, b) => a.time - b.time);
  const context = groups.flatMap((g) => g.notes.map((n) => ({ start: g.time, pitch: n.pitch })));

  const cap = { maxNotes: rule.maxNotes, windowMs: rule.windowMs * scale, minGapMs: rule.minGapMs * scale };
  const chosen = thin(groups, cap, include);
  const firsts = assignLanes(chosen.map((g) => g.notes.map((n) => ({ start: g.time, pitch: n.pitch }))), context, RULES.laneWindowMs);

  // A note's hold ends before the next onset of its own hand (a melody note gives way to the
  // next melody note); holds in the way of later notes are cut further below.
  const nextOfHand = (gi: number, hand: Hand) => chosen.slice(gi + 1).find((g) => g.notes.some((n) => n.hand === hand))?.time ?? Infinity;
  const holdGap = RULES.holdGapMs * scale;
  const laneGap = RULES.laneGapMs * scale;
  const placed: Placed[] = [];
  const lastOnset: number[] = Array(LANES).fill(-Infinity);
  const held: (Placed | null)[] = Array(LANES).fill(null);
  const holding = (l: number, t: number) => (held[l]?.holdEnd ?? -Infinity) > t - holdGap;
  let shifted = 0;
  let holdCuts = 0;
  const cut = (l: number, t: number) => {
    held[l]!.holdEnd = t - holdGap;
    holdCuts++;
  };

  chosen.forEach((g, gi) => {
    const t = g.time;
    const k = g.notes.length;
    let lanes = g.notes.map((_, i) => firsts[gi] + i);
    const pinned = g.notes.map((n) => pins.get(n.id));
    if (pinned.some((p) => p !== undefined)) {
      // The chord moves with its first pinned note; pinned notes take their lane, the others
      // keep their place next to it unless a pin took it.
      const i0 = pinned.findIndex((p) => p !== undefined);
      const first = Math.min(LANES - k, Math.max(0, pinned[i0]! - i0));
      lanes = pinned.map((p, i) => p ?? first + i);
      g.notes.forEach((_, i) => {
        if (pinned[i] !== undefined) return;
        const taken = (l: number) => lanes.some((x, j) => j !== i && x === l);
        if (taken(lanes[i])) lanes[i] = [0, 1, 2, 3].filter((l) => !taken(l)).sort((a, b) => Math.abs(a - lanes[i]) - Math.abs(b - lanes[i]))[0];
      });
    } else {
      // Shift the chord sideways when a lane is struck too soon after its last note (blocked),
      // or, by one lane at most, to keep clear of a hold that is still down: towards the side of
      // the held note its pitch is on, else the way the melody moves. When every placement has
      // blocked lanes, the one with fewest wins and its blocked notes are dropped below.
      const mean = g.notes.reduce((sum, n) => sum + n.pitch, 0) / k;
      const blocking = lanes.map((l) => held[l]).find((h) => h && holding(h.lane, t));
      const dir = blocking
        ? mean < blocking.note.pitch ? -1 : 1
        : gi > 0 && g.notes[k - 1].pitch >= chosen[gi - 1].notes.at(-1)!.pitch ? 1 : -1;
      const options = [0, dir, -dir, 2 * dir, -2 * dir, 3 * dir, -3 * dir]
        .map((s) => firsts[gi] + s)
        .filter((f) => f >= 0 && f <= LANES - k)
        .map((f) => g.notes.map((_, i) => f + i));
      const blocked = (ls: number[]) => ls.filter((l) => t - lastOnset[l] < laneGap).length;
      const soft = (ls: number[]) => ls.some((l) => holding(l, t));
      const fewest = options.reduce((best, ls) => (blocked(ls) < blocked(best) ? ls : best));
      const pick = options.slice(0, 2).find((ls) => !blocked(ls) && !soft(ls)) ?? fewest;
      if (pick[0] !== lanes[0]) shifted++;
      lanes = pick;
    }
    g.notes.forEach((n, i) => {
      const l = lanes[i];
      if (t - lastOnset[l] < laneGap) {
        if (pinned[i] === undefined) return void warnings.push(`${n.id}: dropped, lane ${l} struck ${Math.round(t - lastOnset[l])} ms before`);
        warnings.push(`${n.id}: pinned to lane ${l}, struck ${Math.round(t - lastOnset[l])} ms after the previous note there`);
      }
      if (holding(l, t)) cut(l, t);
      // Lane limit: a chord plus the holds still down never needs more than `lanes` fingers.
      const others = [0, 1, 2, 3].filter((x) => x !== l && !lanes.includes(x) && holding(x, t));
      const busy = others.length + lanes.length;
      if (busy > rule.lanes) others.sort((a, b) => held[a]!.note.start - held[b]!.note.start).slice(0, busy - rule.lanes).forEach((x) => cut(x, t));
      const long = n.duration >= RULES.holdBeats * beatLengthAt(grid.beats, n.start) || forceHold.has(n.id);
      const p: Placed = { note: n, lane: l, holdEnd: long ? Math.min(n.start + n.duration, nextOfHand(gi, n.hand) - holdGap) : null, forcedHold: forceHold.has(n.id) };
      placed.push(p);
      lastOnset[l] = t;
      held[l] = p.holdEnd === null ? null : p;
    });
  });

  const notes: ChartNote[] = placed.map(({ note, lane, holdEnd, forcedHold }) => {
    const length = holdEnd === null ? 0 : holdEnd - note.start;
    const min = forcedHold ? RULES.forcedHoldMs * scale : Math.max(RULES.minHoldMs * scale, RULES.holdBeats * beatLengthAt(grid.beats, note.start));
    const hold = length >= min;
    return hold ? { id: note.id, lane, hold: Math.round(length) } : { id: note.id, lane };
  });
  const startOf = new Map(placed.map((p) => [p.note.id, p.note.start]));
  notes.sort((a, b) => startOf.get(a.id)! - startOf.get(b.id)! || a.lane - b.lane);
  const byOnset = new Map<number, string[]>();
  for (const p of placed) {
    const g = chosen.find((x) => x.notes.includes(p.note))!;
    byOnset.set(g.time, [...(byOnset.get(g.time) ?? []), p.note.id]);
  }
  const chords = [...byOnset.values()].filter((ids) => ids.length > 1);

  const played = notes.map((c) => startOf.get(c.id)! / tempoFactor);
  const stats: TierStats = {
    notes: notes.length,
    avg: notes.length > 1 ? notes.length / ((played.at(-1)! - played[0]) / 1000) : 0,
    peak: peakDensity(played, 4000),
    chords: chords.length,
    chordNotes: chords.flat().length,
    holds: notes.filter((c) => c.hold).length,
    lanes: [0, 1, 2, 3].map((l) => notes.filter((c) => c.lane === l).length),
    shifted,
    holdCuts,
  };
  return { tier: { level: level(stats), tempoFactor, notes, chords }, stats, warnings };
}

// Most notes in any window of `ms`, per second. `times` sorted.
function peakDensity(times: number[], ms: number): number {
  let best = 0;
  for (let i = 0, j = 0; j < times.length; j++) {
    while (times[j] - times[i] >= ms) i++;
    best = Math.max(best, j - i + 1);
  }
  return best / (ms / 1000);
}

// Level 1-10 from played-time density: peak (4 s window) weighs more than average, chord and
// hold shares add a little.
export const LEVEL_FORMULA = "level = clamp(round(1.3 × (0.35 × average n/s + 0.65 × peak n/s over 4 s) + 2 × chord-note share + 1 × hold share), 1, 10)";
export function level(s: Pick<TierStats, "notes" | "avg" | "peak" | "chordNotes" | "holds">): number {
  if (s.notes === 0) return 1;
  const raw = 1.3 * (0.35 * s.avg + 0.65 * s.peak) + 2 * (s.chordNotes / s.notes) + (s.holds / s.notes);
  return Math.min(10, Math.max(1, Math.round(raw)));
}

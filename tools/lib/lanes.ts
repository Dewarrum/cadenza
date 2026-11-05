export const LANES = 4;

type Timed = { start: number; pitch: number };

// Lanes for a sequence of onsets, each a chord of one or more notes (sorted by pitch, at most
// four). The top note's lane is the rank of its pitch among the distinct pitches sounding in the
// melodic context (default: the chords themselves) within ±windowMs/2, spread over the four
// lanes, so rising phrases move right; the rest of the chord takes the adjacent lanes to its
// left (shifted right at the edge). From one onset to the next the top note keeps its
// direction (a higher pitch never lands left of or on the previous lane unless that is the
// edge, a repeated pitch keeps its lane), and within windowMs/2 a step of n semitones moves at
// most ceil(n/3) lanes, so a sliding window cannot throw a small step across the field. A line
// that has sat in an edge lane for windowMs takes its rank lane again at the next new pitch
// (a long descent does not stay in lane 0).
// Returns the first (leftmost) lane of each chord.
export function assignLanes(chords: Timed[][], context: Timed[] = chords.flat(), windowMs = 2000): number[] {
  const firsts: number[] = [];
  let prev: { start: number; pitch: number; lane: number } | null = null;
  let since = 0; // start of the current stay in prev.lane
  for (const chord of chords) {
    const k = chord.length;
    const { start, pitch } = chord[k - 1];
    const nearby = context.filter((n) => Math.abs(n.start - start) <= windowMs / 2);
    const pitches = [...new Set([pitch, ...nearby.map((n) => n.pitch)])].sort((a, b) => a - b);
    let lane = Math.floor(((pitches.indexOf(pitch) + 0.5) / pitches.length) * LANES);
    if (prev) {
      const stuck = (prev.lane === 0 || prev.lane === LANES - 1) && start - since >= windowMs;
      if (pitch === prev.pitch) lane = prev.lane;
      else if (!stuck && pitch > prev.pitch && lane <= prev.lane) lane = Math.min(LANES - 1, prev.lane + 1);
      else if (!stuck && pitch < prev.pitch && lane >= prev.lane) lane = Math.max(0, prev.lane - 1);
      if (start - prev.start < windowMs / 2) {
        const step = Math.ceil(Math.abs(pitch - prev.pitch) / 3);
        lane = Math.min(prev.lane + step, Math.max(prev.lane - step, lane));
      }
    }
    const first = Math.min(LANES - k, Math.max(0, lane - (k - 1)));
    firsts.push(first);
    if (!prev || prev.lane !== first + k - 1) since = start;
    prev = { start, pitch, lane: first + k - 1 };
  }
  return firsts;
}

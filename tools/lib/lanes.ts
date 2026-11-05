export const LANES = 4;

type Timed = { start: number; pitch: number };

// Lane = rank of the note's pitch among the distinct pitches sounding in the melodic context
// (default: the chart notes themselves) within ±windowMs/2, spread over the four lanes, so
// rising phrases move right. Consecutive notes keep their direction: a higher pitch never
// lands left of (or on) the previous lane unless that lane is the edge, a repeated pitch keeps
// its lane.
export function assignLanes(notes: Timed[], context: Timed[] = notes, windowMs = 2000): number[] {
  const lanes: number[] = [];
  notes.forEach((note, i) => {
    const nearby = context.filter((n) => Math.abs(n.start - note.start) <= windowMs / 2);
    const pitches = [...new Set([note.pitch, ...nearby.map((n) => n.pitch)])].sort((a, b) => a - b);
    let lane = Math.floor(((pitches.indexOf(note.pitch) + 0.5) / pitches.length) * LANES);
    const prev = notes[i - 1];
    if (prev) {
      const prevLane = lanes[i - 1];
      if (note.pitch === prev.pitch) lane = prevLane;
      else if (note.pitch > prev.pitch && lane <= prevLane) lane = Math.min(LANES - 1, prevLane + 1);
      else if (note.pitch < prev.pitch && lane >= prevLane) lane = Math.max(0, prevLane - 1);
    }
    lanes.push(lane);
  });
  return lanes;
}

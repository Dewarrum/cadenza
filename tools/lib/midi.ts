// Reads a Standard MIDI File into notes with tick and millisecond times.
import { parseMidi } from "midi-file";
import type { Hand } from "../../src/piece.ts";

export type MidiNote = {
  pitch: number;
  startTick: number;
  endTick: number;
  velocity: number;
  track: number;
  channel: number;
};

export type MidiTrack = { index: number; name: string; notes: MidiNote[] };

export type MidiData = {
  ppq: number;
  tracks: MidiTrack[];
  tempos: { tick: number; usPerQuarter: number }[];
  timeSignatures: { tick: number; numerator: number; denominator: number }[];
  endTick: number;
  usesVolumeDynamics: boolean;
  tickToMs: (tick: number) => number;
};

export function readMidi(bytes: Uint8Array): MidiData {
  const midi = parseMidi(bytes);
  const ppq = midi.header.ticksPerBeat;
  if (!ppq) throw new Error("SMPTE time division is not supported");

  const tempos: MidiData["tempos"] = [];
  const timeSignatures: MidiData["timeSignatures"] = [];
  const volumes: { tick: number; channel: number; value: number }[] = [];
  const tracks: MidiTrack[] = [];
  let endTick = 0;

  midi.tracks.forEach((events, index) => {
    let tick = 0;
    let name = "";
    const notes: MidiNote[] = [];
    const open = new Map<string, MidiNote[]>();
    for (const e of events) {
      tick += e.deltaTime;
      if (e.type === "trackName") name = e.text.trim();
      else if (e.type === "setTempo") tempos.push({ tick, usPerQuarter: e.microsecondsPerBeat });
      else if (e.type === "timeSignature") {
        timeSignatures.push({ tick, numerator: e.numerator, denominator: e.denominator });
      } else if (e.type === "controller" && e.controllerType === 7) {
        volumes.push({ tick, channel: e.channel, value: e.value });
      } else if (e.type === "noteOn" && e.velocity > 0) {
        const note = { pitch: e.noteNumber, startTick: tick, endTick: tick, velocity: e.velocity, track: index, channel: e.channel };
        const key = `${e.channel}:${e.noteNumber}`;
        open.set(key, [...(open.get(key) ?? []), note]);
        notes.push(note);
      } else if (e.type === "noteOff" || e.type === "noteOn") {
        const stack = open.get(`${e.channel}:${e.noteNumber}`);
        const note = stack?.shift();
        if (note) note.endTick = tick;
      }
    }
    endTick = Math.max(endTick, tick);
    if (notes.length > 0) tracks.push({ index, name, notes });
  });

  tempos.sort((a, b) => a.tick - b.tick);
  if (tempos[0]?.tick !== 0) tempos.unshift({ tick: 0, usPerQuarter: 500000 });
  timeSignatures.sort((a, b) => a.tick - b.tick);
  if (timeSignatures[0]?.tick !== 0) timeSignatures.unshift({ tick: 0, numerator: 4, denominator: 4 });

  // LilyPond writes dynamics as channel volume (CC7) with a constant note velocity, and usually
  // only on the staff that carries the markings. Fold the volume into the velocity so that the
  // velocity really reflects loudness; a channel without CC7 follows the piece-wide dynamics.
  const usesVolumeDynamics = volumes.length > 0;
  if (usesVolumeDynamics) {
    volumes.sort((a, b) => a.tick - b.tick);
    for (const track of tracks) {
      for (const note of track.notes) {
        const own = volumes.filter((v) => v.channel === note.channel);
        const timeline = own.length > 0 ? own : volumes;
        const current = timeline.filter((v) => v.tick <= note.startTick).at(-1) ?? timeline[0];
        note.velocity = Math.max(1, Math.round((note.velocity * current.value) / 127));
      }
    }
  }

  const tickToMs = (tick: number): number => {
    let ms = 0;
    for (let i = 0; i < tempos.length; i++) {
      const from = tempos[i].tick;
      const to = Math.min(tick, tempos[i + 1]?.tick ?? Infinity);
      if (to <= from) break;
      ms += ((to - from) * tempos[i].usPerQuarter) / ppq / 1000;
    }
    return ms;
  };

  return { ppq, tracks, tempos, timeSignatures, endTick, usesVolumeDynamics, tickToMs };
}

const RIGHT_NAME = /right|upper|treble|\brh\b|oben|destra|droite/i;
const LEFT_NAME = /left|lower|bass|\blh\b|unten|sinistra|gauche/i;

// Decides which hand each note track belongs to. Mutopia/LilyPond files have one track per staff
// (sometimes one per voice); names are tried first, then the average pitch.
export function classifyHands(tracks: MidiTrack[], log: (line: string) => void): Map<number, Hand> {
  const hands = new Map<number, Hand>();
  const meanPitch = (t: MidiTrack) => t.notes.reduce((s, n) => s + n.pitch, 0) / t.notes.length;
  for (const t of tracks) {
    log(`track ${t.index} "${t.name}": ${t.notes.length} notes, mean pitch ${meanPitch(t).toFixed(1)}`);
  }
  if (tracks.length === 1) {
    log(`only one note track: splitting hands at middle C`);
    return hands; // empty map: caller splits by pitch
  }
  const named = tracks.filter((t) => RIGHT_NAME.test(t.name) !== LEFT_NAME.test(t.name));
  if (named.length === tracks.length && named.some((t) => RIGHT_NAME.test(t.name)) && named.some((t) => LEFT_NAME.test(t.name))) {
    for (const t of tracks) hands.set(t.index, RIGHT_NAME.test(t.name) ? "R" : "L");
    log(`hands from track names`);
  } else {
    const sorted = [...tracks].sort((a, b) => meanPitch(b) - meanPitch(a));
    const rightCount = Math.max(1, Math.floor(sorted.length / 2));
    sorted.forEach((t, i) => hands.set(t.index, i < rightCount ? "R" : "L"));
    log(`hands from mean pitch (track names unclear)`);
  }
  for (const t of tracks) log(`  track ${t.index} -> ${hands.get(t.index) === "R" ? "right" : "left"} hand`);
  return hands;
}

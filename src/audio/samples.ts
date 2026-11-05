// Self-hosted subset of smplr's SplendidGrandPiano (public-domain samples).
// Shared by the runtime loader (piano.ts) and tools/fetch-samples.ts.

// Nearest SplendidGrandPiano sample root to every third semitone from A0 (21) to C8 (108).
// The source set has no roots below 23 and some gaps of 2, so a few steps are 2 or 4 apart.
export const SAMPLE_ROOTS = [
  23, 27, 29, 33, 35, 38, 41, 45, 48, 50, 53, 57, 60, 62, 65, 69, 72, 74, 77, 81, 83, 87, 90, 93,
  96, 99, 102, 105, 108,
];

// Two velocity layers. The Nocturne is mostly p/pp with a few ff climaxes, so the soft "PP"
// layer (recorded for velocities 41-67) and the "MF" layer (85-100) cover it; the split sits
// halfway between the two recordings. `source` is the layer name in smplr's LAYERS table.
export const SAMPLE_LAYERS = [
  { file: "pp", source: "PP", velRange: [0, 76] as [number, number] },
  { file: "mf", source: "MF", velRange: [77, 127] as [number, number] },
];

export const SAMPLE_FORMATS = ["ogg", "m4a"];

// Cache Storage name for the samples, shared by the page (piano.ts) and the service worker
// (vite.config.ts). Bump the version when the sample files change: the page then deletes the
// old cache (pwa.ts) and every player downloads the new set once.
export const SAMPLES_CACHE = "cadenza-samples-v1";

export function sampleFile(layerFile: string, root: number): string {
  return `${layerFile}-${root}`;
}

// Piano = smplr's sampler engine fed with our self-hosted SplendidGrandPiano subset.
// smplr's own SplendidGrandPiano factory can only narrow to a contiguous velocity range, so we
// build the preset ourselves (two layers, nearest-root key ranges) and load it through
// smplr's Instrument plugin; smplr handles fetching, format choice (ogg, m4a on Safari),
// decoding, pitch shifting by detune and release envelopes.
import { Instrument, type SmplrPreset } from "smplr";
import { SAMPLE_FORMATS, SAMPLE_LAYERS, SAMPLE_ROOTS, sampleFile } from "./samples.ts";

function keyRanges(roots: number[]): { keyRange: [number, number]; pitch: number }[] {
  return roots.map((root, i) => ({
    keyRange: [i === 0 ? 0 : Math.floor((roots[i - 1] + root) / 2) + 1, i === roots.length - 1 ? 127 : Math.floor((root + roots[i + 1]) / 2)],
    pitch: root,
  }));
}

function preset(baseUrl: string): SmplrPreset {
  return {
    samples: { baseUrl, formats: SAMPLE_FORMATS },
    defaults: { ampRelease: 0.5 },
    groups: SAMPLE_LAYERS.map((layer) => ({
      velRange: layer.velRange,
      regions: keyRanges(SAMPLE_ROOTS).map((r) => ({ ...r, sample: sampleFile(layer.file, r.pitch) })),
    })),
  };
}

const SubsetPiano = Instrument<{ baseUrl: string }>((_ctx, options, smplr) => smplr.loadInstrument(preset(options.baseUrl)));

export type Piano = ReturnType<typeof SubsetPiano>;

export function loadPiano(ctx: AudioContext, destination: AudioNode, onProgress: (fraction: number) => void): Promise<Piano> {
  const piano = SubsetPiano(ctx, {
    baseUrl: `${import.meta.env.BASE_URL}samples`,
    destination,
    onLoadProgress: ({ loaded, total }) => onProgress(total ? loaded / total : 1),
  });
  return piano.load;
}

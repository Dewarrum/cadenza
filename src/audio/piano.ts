// Piano = smplr's sampler engine fed with our self-hosted SplendidGrandPiano subset.
// smplr's own SplendidGrandPiano factory can only narrow to a contiguous velocity range, so we
// build the preset ourselves (two layers, nearest-root key ranges) and load it through
// smplr's Instrument plugin; smplr handles format choice (ogg, m4a on Safari), decoding, pitch
// shifting by detune and release envelopes. Fetching goes through the samples cache.
import { Instrument, Scheduler, type SmplrPreset } from "smplr";
import { SAMPLE_FORMATS, SAMPLE_LAYERS, SAMPLE_ROOTS, SAMPLES_CACHE, sampleFile } from "./samples.ts";

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

// smplr holds back notes more than its lookahead (200 ms by default) ahead and starts them from
// its own timer. Hit sounds can be further ahead: an early hit sounds at the target time, which
// with a negative audio offset is up to 140 ms + |offset| away, and a resume re-sounds notes
// seconds ahead. With this lookahead every start() goes straight onto the audio timeline, where
// the returned stop function and AudioEngine.stop() cancel it exactly. Notes that play by
// themselves are fed 200 ms ahead by AudioEngine's own scheduler.
const HIT_LOOKAHEAD_MS = 30_000;

export type Piano = ReturnType<typeof SubsetPiano>;

// Cache-first in the samples cache that the service worker also serves, written from the page:
// after one complete load the piano works offline, even on the first visit, when the service
// worker does not control the page yet. The dev server (no service worker either) and plain
// http without Cache Storage just fetch.
const sampleCache = (): Promise<Cache | null> =>
  "caches" in window && !import.meta.env.DEV ? caches.open(SAMPLES_CACHE).catch(() => null) : Promise.resolve(null);

// True when a full set of samples sits in the cache, i.e. the piano loads offline.
export async function samplesCached(): Promise<boolean> {
  const keys = (await (await sampleCache())?.keys().catch(() => null)) ?? [];
  return keys.length >= SAMPLE_ROOTS.length * SAMPLE_LAYERS.length;
}

function cachedFetch(): { fetch(url: string): Promise<Response> } {
  const cache = sampleCache();
  return {
    async fetch(url) {
      const c = await cache;
      const hit = await c?.match(url);
      if (hit) return hit;
      const res = await fetch(url);
      if (res.ok) await c?.put(url, res.clone()).catch(() => {});
      return res;
    },
  };
}

export function loadPiano(ctx: AudioContext, destination: AudioNode, onProgress: (fraction: number) => void): Promise<Piano> {
  const piano = SubsetPiano(ctx, {
    baseUrl: `${import.meta.env.BASE_URL}samples`,
    destination,
    scheduler: Scheduler(ctx, { lookaheadMs: HIT_LOOKAHEAD_MS }),
    storage: cachedFetch(),
    onLoadProgress: ({ loaded, total }) => onProgress(total ? loaded / total : 1),
  });
  return piano.load;
}

// Piece catalogue and lazy loading. The catalogue (titles, levels, file URL) is generated at
// build time by the `pieces` plugin in vite.config.ts; a piece file is fetched when one of its
// tiers is picked (the service worker has it precached, so this works offline).
import catalogue from "virtual:pieces";
import type { Piece, TierName } from "./piece.ts";

export type PieceInfo = { id: string; title: string; composer: string; opus: string; levels: Record<TierName, number>; url: string };

export const PIECES: PieceInfo[] = catalogue;

const loaded = new Map<string, Promise<Piece>>();

export function loadPiece(info: PieceInfo): Promise<Piece> {
  let piece = loaded.get(info.id);
  if (!piece) {
    piece = fetch(info.url).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<Piece>;
    });
    piece.catch(() => loaded.delete(info.id)); // a failed fetch is retried on the next tap
    loaded.set(info.id, piece);
  }
  return piece;
}

// Writes the app icons to public/icons/ (PNG, drawn here, no image tools needed): the gilt
// fermata of the title screen (the <symbol id="fermata"> in index.html, same geometry) on
// lacquer under a warm light. Usage: npm run icons
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

type RGB = [number, number, number];

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const LACQUER = hex("#0e0b09");
const LAMP = hex("#6b4220");
const GILT = hex("#d3aa5c");

// The fermata in its 64 x 36 symbol units: a crescent between two half-ellipses on the
// baseline, thick at the top and thin at the ends, and a dot under it.
function inFermata(gx: number, gy: number): boolean {
  if (Math.hypot(gx - 32, gy - 28.6) <= 4.6) return true;
  if (gy > 33.8) return false;
  const outer = ((gx - 32) / 30.5) ** 2 + ((gy - 33.5) / 30.5) ** 2 <= 1;
  const inner = ((gx - 32) / 28.9) ** 2 + ((gy - 33.8) / 21.6) ** 2 < 1;
  return outer && !inner;
}

// The glyph is 0.62 of the icon wide, centred; `scale` shrinks it about the centre (maskable
// icons keep it inside the safe zone).
const GLYPH = 0.62;
function inside(u: number, v: number, scale: number): boolean {
  const s = (GLYPH * scale) / 64;
  return inFermata((u - 0.5) / s + 32, (v - 0.5) / s + 18.7);
}

// RGBA pixels, 4x4 supersampled.
function render(size: number, scale: number): Buffer {
  const px = Buffer.alloc(size * size * 4);
  const N = 4;
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const u = (pxl + (sx + 0.5) / N) / size;
          const v = (py + (sy + 0.5) / N) / size;
          // Warm light under the mark, darker towards the corners.
          const lamp = Math.max(0, 1 - Math.hypot(u - 0.5, (v - 0.6) * 1.2) / 0.62) ** 1.6 * 0.55;
          const edge = Math.min(1, Math.hypot(u - 0.5, v - 0.5) / 0.75) ** 3 * 0.5;
          let c = LACQUER.map((ch, k) => (ch + (LAMP[k] - ch) * lamp) * (1 - edge));
          if (inside(u, v, scale)) c = [...GILT];
          c.forEach((ch, k) => (acc[k] += ch));
        }
      }
      const o = (py * size + pxl) * 4;
      px[o] = Math.round(acc[0] / (N * N));
      px[o + 1] = Math.round(acc[1] / (N * N));
      px[o + 2] = Math.round(acc[2] / (N * N));
      px[o + 3] = 255;
    }
  }
  return px;
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size: number, rgba: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const OUT = join(import.meta.dirname, "..", "public", "icons");
mkdirSync(OUT, { recursive: true });
for (const [name, size, scale] of [
  ["icon-192.png", 192, 1],
  ["icon-512.png", 512, 1],
  ["icon-maskable-512.png", 512, 0.78],
  ["apple-touch-icon.png", 180, 0.9],
] as const) {
  writeFileSync(join(OUT, name), png(size, render(size, scale)));
  console.log(`public/icons/${name}`);
}

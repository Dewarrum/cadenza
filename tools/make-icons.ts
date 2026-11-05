// Writes the placeholder app icons to public/icons/ (PNG, drawn here, no image tools needed):
// four ivory keys under a gold judgement line with notes falling in, on the dark background.
// S5 restyles them. Usage: npm run icons
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

type RGBA = [number, number, number, number];
type Shape = { x0: number; y0: number; x1: number; y1: number; r?: number; color: RGBA };

const hex = (h: string, a = 1): RGBA => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];
const BG = hex("#0b0908");
const IVORY = hex("#f3ead8");
const KEY = hex("#efe6d2");
const LIT = hex("#ffd98a");
const GOLD = hex("#d9b25f");
const TAIL = hex("#f3ead8", 0.35);

// Artwork in unit coordinates, inside 0.14-0.86 so that it also fits a maskable safe zone when
// scaled down.
const lane = (i: number) => 0.14 + i * 0.18;
const SHAPES: Shape[] = [
  { x0: lane(0) + 0.07, y0: 0.2, x1: lane(0) + 0.11, y1: 0.5, color: TAIL },
  { x0: lane(0) + 0.02, y0: 0.47, x1: lane(0) + 0.16, y1: 0.52, r: 0.015, color: IVORY },
  { x0: lane(2) + 0.02, y0: 0.32, x1: lane(2) + 0.16, y1: 0.37, r: 0.015, color: IVORY },
  { x0: lane(3) + 0.02, y0: 0.16, x1: lane(3) + 0.16, y1: 0.21, r: 0.015, color: IVORY },
  { x0: 0.14, y0: 0.6, x1: 0.86, y1: 0.615, color: GOLD },
  ...[0, 1, 2, 3].map((i): Shape => ({ x0: lane(i) + 0.005, y0: 0.63, x1: lane(i) + 0.175, y1: 0.84, r: 0.01, color: i === 1 ? LIT : KEY })),
];

function inside(s: Shape, x: number, y: number): boolean {
  if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) return false;
  const r = s.r ?? 0;
  const dx = Math.max(s.x0 + r - x, 0, x - (s.x1 - r));
  const dy = Math.max(s.y0 + r - y, 0, y - (s.y1 - r));
  return dx * dx + dy * dy <= r * r;
}

// RGBA pixels, 4x4 supersampled; `scale` shrinks the artwork about the centre (maskable).
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
          // Warm glow around the keys, like the play screen.
          const glow = Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.66) / 0.6) * 0.3;
          let c = [BG[0] + (120 - BG[0]) * glow, BG[1] + (70 - BG[1]) * glow, BG[2] + (30 - BG[2]) * glow];
          const x = (u - 0.5) / scale + 0.5;
          const y = (v - 0.5) / scale + 0.5;
          for (const s of SHAPES) if (inside(s, x, y)) c = c.map((ch, k) => ch + (s.color[k] - ch) * s.color[3]);
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

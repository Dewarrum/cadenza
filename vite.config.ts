import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { SAMPLES_CACHE } from "./src/audio/samples.ts";

// Dev server on a fixed port for phone testing. `tailscale serve` publishes
// https://studio.tail4d4c2e.ts.net:8444 -> http://127.0.0.1:5184. The HMR client takes the
// socket host and port from the page URL, so HMR works through that proxy as is;
// `npm run dev:tailnet` (CADENZA_TAILNET=1) pins the socket to the proxy explicitly.
const TAILNET_HOST = "studio.tail4d4c2e.ts.net";
const tailnet = process.env.CADENZA_TAILNET === "1";
const THEME = "#0e0b09";

// `virtual:pieces`: the piece list needs titles and levels only. Each pieces/<id>.json becomes a
// separate asset (`?url`) that the game fetches when a tier is picked; the service worker
// precaches it.
function pieces(): Plugin {
  const id = "virtual:pieces";
  const dir = join(import.meta.dirname, "pieces");
  return {
    name: "cadenza-pieces",
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load(resolved) {
      if (resolved !== `\0${id}`) return;
      const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".overrides.json")).sort();
      const imports: string[] = [];
      const entries = files.map((file, i) => {
        const path = join(dir, file);
        this.addWatchFile(path);
        const p = JSON.parse(readFileSync(path, "utf8"));
        const levels = { easy: p.tiers.easy.level, normal: p.tiers.normal.level, hard: p.tiers.hard.level };
        imports.push(`import url${i} from ${JSON.stringify(`${path}?url`)};`);
        return `{ ...${JSON.stringify({ id: p.id, title: p.title, composer: p.composer, opus: p.opus, levels })}, url: url${i} }`;
      });
      return `${imports.join("\n")}\nexport default [${entries.join(", ")}];\n`;
    },
  };
}

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5184,
    strictPort: true,
    allowedHosts: [TAILNET_HOST],
    ws: tailnet ? { protocol: "wss", host: TAILNET_HOST, clientPort: 8444 } : undefined,
  },
  plugins: [
    pieces(),
    // Service worker (production build only): the app shell and the piece files are precached
    // and revisioned by the build; piano samples are cached at runtime, cache-first, so only
    // the format this browser plays is stored. A new version waits for the next launch
    // (src/pwa.ts shows an "Update available" toast meanwhile).
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["icons/apple-touch-icon.png"], // the manifest icons are added by the plugin
      manifest: {
        name: "Cadenza",
        short_name: "Cadenza",
        description: "A piano rhythm game with classical pieces",
        display: "standalone",
        orientation: "portrait",
        theme_color: THEME,
        background_color: THEME,
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,json,woff2}"],
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\/samples\/[^/]+\.(?:ogg|m4a)$/,
            handler: "CacheFirst",
            options: {
              cacheName: SAMPLES_CACHE,
              expiration: { maxEntries: 200, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
});

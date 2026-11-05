import { defineConfig } from "vite";

// Dev server on a fixed port for phone testing. `tailscale serve` publishes
// https://studio.tail4d4c2e.ts.net:8444 -> http://127.0.0.1:5184. The HMR client takes the
// socket host and port from the page URL, so HMR works through that proxy as is;
// `npm run dev:tailnet` (CADENZA_TAILNET=1) pins the socket to the proxy explicitly.
const TAILNET_HOST = "studio.tail4d4c2e.ts.net";
const tailnet = process.env.CADENZA_TAILNET === "1";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5184,
    strictPort: true,
    allowedHosts: [TAILNET_HOST],
    ws: tailnet ? { protocol: "wss", host: TAILNET_HOST, clientPort: 8444 } : undefined,
  },
});

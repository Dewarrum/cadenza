import { defineConfig, devices } from "@playwright/test";

// Runs against the frozen production build (`vite preview` of dist/), never the HMR dev server,
// or against a deployed site: BASE_URL=https://cadenza.pages.dev npx playwright test --project desktop
const deployed = process.env.BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  reporter: "list",
  use: {
    baseURL: deployed ?? "http://127.0.0.1:4179",
    browserName: "chromium",
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  projects: [
    { name: "desktop", testMatch: ["smoke.spec.ts", "settings.spec.ts", "offline.spec.ts"] },
    { name: "phone", testMatch: "phone.spec.ts", use: { ...devices["Pixel 7"] } },
  ],
  webServer: deployed
    ? undefined
    : {
        command: "npx vite preview --host 127.0.0.1 --port 4179 --strictPort",
        url: "http://127.0.0.1:4179",
        reuseExistingServer: false,
      },
});

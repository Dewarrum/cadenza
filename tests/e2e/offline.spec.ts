import { expect, test } from "@playwright/test";
import { playPerfect } from "./bot.ts";

// One online run installs the service worker and caches the piano; then the app loads and
// plays with the network gone.
test("after one online run the app loads and plays offline", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?clock=manual");
  await page.locator("#title").click();
  await expect(page.locator("#piano-status")).toHaveText("Piano ready · works offline", { timeout: 60_000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  // The network is really gone for the service worker too: an uncached sample cannot be fetched.
  expect(await page.evaluate(() => fetch("/samples/not-cached.ogg").then(() => "fetched", () => "failed"))).toBe("failed");
  await page.reload();
  await page.locator("#title").click();
  const { notes, summary } = await playPerfect(page, "Prelude", "normal", ["KeyD", "KeyF", "KeyJ", "KeyK"]);
  expect(summary.counts.perfect).toBe(notes.length);
  expect(errors).toEqual([]);
});

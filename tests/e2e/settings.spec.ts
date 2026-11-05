import { expect, test } from "@playwright/test";
import { playPerfect } from "./bot.ts";

declare const window: Window & { __cadenza: { settings: { approachMs: number | null } } };

test("a rebound lane key plays, a taken key is refused, the best result shows on the list, then settings change and clear it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?clock=manual");
  await page.locator("#title").click();
  await page.locator("#open-about").click();
  await expect(page.locator("#about .license")).toHaveText(["CC BY-SA 3.0", "CC BY-SA 4.0"]);
  await page.locator("#about-back").click();
  await page.locator("#open-settings").click();

  const lane1 = page.locator('#keys button[data-lane="0"]');
  await lane1.click();
  await page.keyboard.press("KeyF");
  await expect(page.locator("#keys-note")).toContainText("F is already lane 2");
  await page.keyboard.press("KeyS");
  await expect(lane1).toHaveText("S");
  await page.locator("#settings-back").click();
  await expect(page.locator("#list .hint .keys-hint")).toHaveText("S F J K");

  const { notes, summary } = await playPerfect(page, "Nocturne", "easy", ["KeyS", "KeyF", "KeyJ", "KeyK"]);
  expect(notes.some((n) => n.lane === 0)).toBe(true);
  expect(summary.counts.perfect).toBe(notes.length);
  await expect(page.locator("#best")).toHaveText("New best");

  await page.locator("#back").click();
  await expect(page.locator(".piece", { hasText: "Nocturne" }).locator('button[data-tier="easy"] .best')).toHaveText("S · FC");

  // One approach time for all tiers starts from the one in effect (Easy, just played: 1.5 s).
  await page.locator("#open-settings").click();
  await page.locator("label:has(#approach-all)").click();
  expect(await page.evaluate(() => window.__cadenza.settings.approachMs)).toBe(1500);
  // Clearing results asks in the app first.
  await page.locator("#clear-results").click();
  await page.locator("#confirm button[value=clear]").click();
  await expect(page.locator("#settings-note")).toHaveText("All results cleared.");
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("cadenza.settings.v1")!).keys)).toEqual(["KeyS", "KeyF", "KeyJ", "KeyK"]);
  expect(errors).toEqual([]);
});

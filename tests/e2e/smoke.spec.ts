import { expect, test } from "@playwright/test";

type Hook = {
  pianoReady: boolean;
  summary: { accuracy: number; grade: string } | null;
  chart(): { time: number; lane: number; hold: number }[];
  end(): number;
  advance(ms: number): void;
};
declare const window: Window & { __cadenza: Hook };

test("a bot plays the Nocturne on Easy and reaches the results screen", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?clock=manual");
  await page.locator("#title").click();

  const easy = page.locator('button[data-tier="easy"]');
  await expect(easy).toBeEnabled({ timeout: 60_000 }); // enabled once the piano samples are decoded
  await easy.click();
  await page.locator("#howto").click(); // first play shows the how-to card once

  const notes = await page.evaluate(() => window.__cadenza.chart());
  const end = await page.evaluate(() => window.__cadenza.end());
  expect(notes.length).toBeGreaterThan(100);
  const advance = (ms: number) => page.evaluate((t) => window.__cadenza.advance(t), ms);

  // Deterministic timing error of up to ±60 ms; every fifth note is played with Space.
  let seed = 7;
  const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 120;
  const lanes = ["KeyD", "KeyF", "KeyJ", "KeyK"];
  for (const [i, n] of notes.entries()) {
    const key = i % 5 === 4 ? "Space" : lanes[n.lane];
    await advance(n.time + jitter());
    await page.keyboard.down(key);
    if (n.hold) await advance(n.time + n.hold + 20);
    await page.keyboard.up(key);
  }
  await advance(end + 2000);

  await expect(page.locator("#results")).toBeVisible();
  const summary = await page.evaluate(() => window.__cadenza.summary);
  expect(summary!.accuracy).toBeGreaterThan(90);
  await expect(page.locator("#grade")).toHaveText(summary!.grade);
  expect(errors).toEqual([]);
});

import { expect, test, type Page } from "@playwright/test";

type Note = { time: number; lane: number; hold: number };
type Hook = {
  pianoReady: boolean;
  summary: { accuracy: number; grade: string; counts: Record<string, number> } | null;
  chart(): Note[];
  end(): number;
  advance(ms: number): void;
};
declare const window: Window & { __cadenza: Hook };

const LANE_KEYS = ["KeyD", "KeyF", "KeyJ", "KeyK"];

async function open(page: Page, piece: string, tier: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?clock=manual");
  await page.locator("#title").click();
  const button = page.locator(".piece", { hasText: piece }).locator(`button[data-tier="${tier}"]`);
  await expect(button).toBeEnabled({ timeout: 60_000 }); // enabled once the piano samples are decoded
  await button.click();
  await page.locator("#howto").click(); // first play shows the how-to card once
  const notes = await page.evaluate(() => window.__cadenza.chart());
  const end = await page.evaluate(() => window.__cadenza.end());
  const advance = (ms: number) => page.evaluate((t) => window.__cadenza.advance(t), ms);
  return { errors, notes, end, advance };
}

test("a bot plays the Nocturne on Easy and reaches the results screen", async ({ page }) => {
  const { errors, notes, end, advance } = await open(page, "Nocturne", "easy");
  expect(notes.length).toBeGreaterThan(100);

  // Deterministic timing error of up to ±60 ms; every fifth note is played with Space.
  let seed = 7;
  const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 120;
  for (const [i, n] of notes.entries()) {
    const key = i % 5 === 4 ? "Space" : LANE_KEYS[n.lane];
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

// A perfect bot proves the chart is hittable: chords, holds over other lanes' notes, and no two
// notes in a lane closer than the judge can tell apart.
test("a perfect bot plays the Rachmaninoff on Hard", async ({ page }) => {
  const { errors, notes, end, advance } = await open(page, "Prelude", "hard");
  const chords = new Set(notes.map((n) => n.time)).size;
  expect(chords).toBeLessThan(notes.length); // there are chords

  // Key presses on the note times, releases after a hold's tail or 30 ms after a tap; releases
  // go first when both fall on one time.
  const events = notes
    .flatMap((n) => [
      { t: n.time, down: true, key: LANE_KEYS[n.lane] },
      { t: n.time + (n.hold ? n.hold + 20 : 30), down: false, key: LANE_KEYS[n.lane] },
    ])
    .sort((a, b) => a.t - b.t || Number(a.down) - Number(b.down));
  let now = -Infinity;
  for (const e of events) {
    if (e.t !== now) await advance((now = e.t));
    await (e.down ? page.keyboard.down(e.key) : page.keyboard.up(e.key));
  }
  await advance(end + 2000);

  await expect(page.locator("#results")).toBeVisible();
  const summary = (await page.evaluate(() => window.__cadenza.summary))!;
  expect(summary.accuracy).toBeGreaterThan(90);
  expect(summary.counts.perfect).toBe(notes.length);
  expect(errors).toEqual([]);
});

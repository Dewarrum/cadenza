import { expect, test, type Page } from "@playwright/test";

type Note = { time: number; lane: number; hold: number };
type Hook = {
  paused: boolean;
  summary: { counts: Record<string, number> } | null;
  chart(): Note[];
  end(): number;
  results(): ({ judgement: string } | null)[];
  lit(): boolean[];
  now(): number;
  advance(ms: number): void;
};
declare const window: Window & { __cadenza: Hook };

// Fingers are CDP touch points, so Chromium turns them into real touch pointer events.
async function touchscreen(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const box = (await page.locator("#field").boundingBox())!;
  const at = (lane: number, id: number) => ({ x: box.x + box.width * (lane + 0.5) / 4, y: box.y + box.height * 0.3, id });
  return {
    box,
    down: (...lanes: number[]) => cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: lanes.map(at) }),
    up: () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }),
  };
}

test("touch play on a portrait phone with a two-finger press and a pause", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?clock=manual");
  await page.locator("#title").tap();
  const easy = page.locator('button[data-tier="easy"]');
  await expect(easy).toBeEnabled({ timeout: 60_000 });
  await easy.tap();
  await page.locator("#howto").tap();

  // The play screen fills the phone at device resolution.
  const viewport = page.viewportSize()!;
  const fingers = await touchscreen(page);
  expect(fingers.box).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  const dpr = await page.evaluate(() => devicePixelRatio);
  expect(await page.locator("#field").evaluate((c: HTMLCanvasElement) => c.width)).toBe(Math.round(viewport.width * dpr));

  const notes = await page.evaluate(() => window.__cadenza.chart());
  const advance = (ms: number) => page.evaluate((t) => window.__cadenza.advance(t), ms);
  const results = () => page.evaluate(() => window.__cadenza.results().map((r) => r?.judgement ?? null));
  const play = async (n: Note, extra: number[] = []) => {
    await advance(n.time);
    await fingers.down(n.lane, ...extra);
    if (n.hold) await advance(n.time + n.hold + 20);
    await fingers.up();
  };

  // Two fingers at once (the chord input path): the note's lane and an empty lane both light,
  // and the note scores one hit. Easy has no chords, so the second lane has nothing to hit.
  const first = notes[0];
  const empty = (first.lane + 2) % 4;
  await advance(first.time);
  await fingers.down(first.lane, empty);
  expect((await page.evaluate(() => window.__cadenza.lit())).filter(Boolean)).toHaveLength(2);
  if (first.hold) await advance(first.time + first.hold + 20);
  await fingers.up();
  expect((await results()).filter(Boolean)).toEqual(["perfect"]);

  const BEFORE = 12;
  for (const n of notes.slice(1, BEFORE)) await play(n);

  // Pause between notes, resume: the clock rewinds at least 2 s, the notes in the rewound
  // window are tapped again and nothing is judged twice.
  const last = notes[BEFORE - 1];
  const pausedAt = last.time + last.hold + 200;
  await advance(pausedAt);
  const judgedBefore = await results();
  await page.locator("#pause").tap();
  await expect(page.locator("#paused")).toBeVisible();
  await page.locator("#resume").tap();
  await expect(page.locator("#paused")).toBeHidden();
  const restart = await page.evaluate(() => window.__cadenza.now());
  expect(restart).toBeLessThanOrEqual(pausedAt - 2000);
  for (const n of notes.filter((n) => n.time >= restart && n.time < pausedAt)) {
    await advance(n.time);
    await fingers.down(n.lane);
    await fingers.up();
  }
  await advance(pausedAt);
  expect(await results()).toEqual(judgedBefore);

  const AFTER = 8;
  for (const n of notes.slice(BEFORE, BEFORE + AFTER)) await play(n);
  await advance((await page.evaluate(() => window.__cadenza.end())) + 2000);

  await expect(page.locator("#results")).toBeVisible();
  const { counts } = (await page.evaluate(() => window.__cadenza.summary))!;
  expect(counts.perfect).toBe(BEFORE + AFTER);
  expect(counts.miss).toBe(notes.length - BEFORE - AFTER);
  expect(errors).toEqual([]);
});

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

test("touch play on a portrait phone: a two-finger chord on Normal, a pause and a resume", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?clock=manual");
  await page.locator("#title").tap();
  const normal = page.locator(".piece", { hasText: "Nocturne" }).locator('button[data-tier="normal"]');
  await expect(normal).toBeEnabled({ timeout: 60_000 });
  await normal.tap();
  await page.locator("#howto").tap();

  // The play screen fills the phone at device resolution.
  const viewport = page.viewportSize()!;
  const fingers = await touchscreen(page);
  expect(fingers.box).toMatchObject({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  const dpr = await page.evaluate(() => devicePixelRatio);
  expect(await page.locator("#field").evaluate((c: HTMLCanvasElement) => c.width)).toBe(Math.round(viewport.width * dpr));

  // Notes hit together form one group: one finger per lane, released after the longest tail
  // or just before the next group.
  const groups: Note[][] = [];
  for (const n of await page.evaluate(() => window.__cadenza.chart())) {
    const last = groups.at(-1);
    if (last && last[0].time === n.time) last.push(n);
    else groups.push([n]);
  }
  const advance = (ms: number) => page.evaluate((t) => window.__cadenza.advance(t), ms);
  const results = () => page.evaluate(() => window.__cadenza.results().map((r) => r?.judgement ?? null));
  const releaseOf = (i: number) => {
    const g = groups[i];
    return Math.min(Math.max(...g.map((n) => n.time + n.hold)) + 20, (groups[i + 1]?.[0].time ?? Infinity) - 10);
  };
  const play = async (i: number) => {
    await advance(groups[i][0].time);
    await fingers.down(...groups[i].map((n) => n.lane));
    await advance(releaseOf(i));
    await fingers.up();
  };

  // The first chord of the Normal chart: two fingers, both lanes light, both notes score.
  const chord = groups.findIndex((g) => g.length === 2);
  for (let i = 0; i < chord; i++) await play(i);
  await advance(groups[chord][0].time);
  await fingers.down(...groups[chord].map((n) => n.lane));
  expect((await page.evaluate(() => window.__cadenza.lit())).filter(Boolean)).toHaveLength(2);
  await advance(releaseOf(chord));
  await fingers.up();
  const before = groups.slice(0, chord + 1).flat().length;
  expect((await results()).filter(Boolean)).toEqual(Array(before).fill("perfect"));

  // Pause in a gap of at least 600 ms after a few more groups, resume: the clock rewinds at
  // least 2 s, the notes in the rewound window are tapped again and nothing is judged twice.
  const last = groups.findIndex((_, i) => i >= chord + 8 && groups[i + 1][0].time - releaseOf(i) >= 600);
  for (let i = chord + 1; i <= last; i++) await play(i);
  const pausedAt = releaseOf(last) + 300;
  await advance(pausedAt);
  const judgedBefore = await results();
  await page.locator("#pause").tap();
  await expect(page.locator("#paused")).toBeVisible();
  await page.locator("#resume").tap();
  await expect(page.locator("#paused")).toBeHidden();
  const restart = await page.evaluate(() => window.__cadenza.now());
  expect(restart).toBeLessThanOrEqual(pausedAt - 2000);
  for (const g of groups.filter((g) => g[0].time >= restart && g[0].time < pausedAt)) {
    await advance(g[0].time);
    await fingers.down(...g.map((n) => n.lane));
    await fingers.up();
  }
  await advance(pausedAt);
  expect(await results()).toEqual(judgedBefore);

  const AFTER = 8;
  for (let i = last + 1; i <= last + AFTER; i++) await play(i);
  await advance((await page.evaluate(() => window.__cadenza.end())) + 2000);

  await expect(page.locator("#results")).toBeVisible();
  const played = groups.slice(0, last + AFTER + 1).flat().length;
  const { counts } = (await page.evaluate(() => window.__cadenza.summary))!;
  expect(counts.perfect).toBe(played);
  expect(counts.miss).toBe(groups.flat().length - played);
  expect(errors).toEqual([]);
});

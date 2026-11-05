import { expect, type Page } from "@playwright/test";

type Note = { time: number; lane: number; hold: number };
type Hook = {
  pianoReady: boolean;
  summary: { accuracy: number; counts: Record<string, number> } | null;
  chart(): Note[];
  end(): number;
  advance(ms: number): void;
};
declare const window: Window & { __cadenza: Hook };

// Picks a tier once the piano is loaded, dismisses the first-play how-to card, then hits every
// note on its time with `keys[lane]` on the manual clock and returns the summary. Releases come
// after a hold's tail or 30 ms after a tap, before presses on the same time.
export async function playPerfect(page: Page, piece: string, tier: string, keys: string[]) {
  const button = page.locator(".piece", { hasText: piece }).locator(`button[data-tier="${tier}"]`);
  await expect(button).toBeEnabled({ timeout: 60_000 });
  await button.click();
  await page.locator("#howto").click();
  const notes = await page.evaluate(() => window.__cadenza.chart());
  const advance = (ms: number) => page.evaluate((t) => window.__cadenza.advance(t), ms);
  const events = notes
    .flatMap((n) => [
      { t: n.time, down: true, key: keys[n.lane] },
      { t: n.time + (n.hold ? n.hold + 20 : 30), down: false, key: keys[n.lane] },
    ])
    .sort((a, b) => a.t - b.t || Number(a.down) - Number(b.down));
  let now = -Infinity;
  for (const e of events) {
    if (e.t !== now) await advance((now = e.t));
    await (e.down ? page.keyboard.down(e.key) : page.keyboard.up(e.key));
  }
  await advance((await page.evaluate(() => window.__cadenza.end())) + 2000);
  await expect(page.locator("#results")).toBeVisible();
  return { notes, summary: (await page.evaluate(() => window.__cadenza.summary))! };
}

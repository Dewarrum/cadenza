// Pointer input (touch, pen, mouse) on the play canvas. Each lane is a target the full height
// of the playfield; one pointer owns a lane at a time, so a chord is one finger per lane.
// Handlers get the event timestamp for the caller to map onto the song clock.
export type LaneHandlers = {
  down(lane: number, timeStamp: number): void;
  up(lane: number, timeStamp: number): void;
};

export class LanePointers {
  private readonly owners: (number | null)[] = [null, null, null, null];

  constructor(el: HTMLElement, handlers: LaneHandlers) {
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const box = el.getBoundingClientRect();
      const lane = Math.min(3, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * 4)));
      if (this.owners[lane] !== null) return;
      this.owners[lane] = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId); // the release arrives even if the finger slides off
      } catch {
        // synthetic events (tests) have no capturable pointer
      }
      handlers.down(lane, e.timeStamp);
    });
    const up = (e: PointerEvent) => {
      const lane = this.owners.indexOf(e.pointerId);
      if (lane < 0) return;
      this.owners[lane] = null;
      handlers.up(lane, e.timeStamp);
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("lostpointercapture", up);
    // No long-press menu, loupe or emulated mouse events on the playfield.
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  }

  // Forgets every pointer (on pause); their later pointerups are ignored.
  reset(): void {
    this.owners.fill(null);
  }
}

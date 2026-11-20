import type { TypingView } from "./types.ts";

// Number of characters of a typewriter-printed question that are visible now.
export function typedChars(t: TypingView | null, now: number, length: number): number {
  if (t === null) return length;
  const elapsed = t.since === null ? 0 : Math.max(0, now - t.since) * t.speed;
  return Math.min(length, Math.floor(t.base + elapsed));
}

/** The caret at the end of the printed part: blinking while printing, still when a buzz stopped it, gone otherwise. */
export type Caret = "none" | "blink" | "still";

export function caretOf(t: TypingView | null, printed: number, length: number): Caret {
  if (t === null || printed >= length) return "none";
  if (t.since !== null) return "blink";
  // stopped before anything was printed: the cell is still expanding and the question has not started
  return t.base > 0 ? "still" : "none";
}

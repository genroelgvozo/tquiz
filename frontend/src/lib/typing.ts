import type { TypingView } from "./types.ts";

// Number of characters of a typewriter-printed question that are visible now.
export function typedChars(t: TypingView | null, now: number, length: number): number {
  if (t === null) return length;
  const elapsed = t.since === null ? 0 : Math.max(0, now - t.since) * t.speed;
  return Math.min(length, Math.floor(t.base + elapsed));
}

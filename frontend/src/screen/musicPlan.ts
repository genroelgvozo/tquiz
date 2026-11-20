// What the background music player must do when the server's idea of the music changes.
// Only `import type` here: tests load this file under node --experimental-strip-types.
import type { MusicNow } from "../lib/types.ts";

export type MusicStep = "none" | "load-play" | "load-pause" | "play" | "pause" | "fade-out";

/**
 * `prev` is what the player follows now, `next` is the new snapshot's music.
 * A new key (or file) starts the track from the beginning; the same key only pauses or resumes it;
 * no music fades the current track out.
 */
export function musicStep(prev: MusicNow | null, next: MusicNow | null): MusicStep {
  if (next === null) return prev === null ? "none" : "fade-out";
  if (prev === null || prev.key !== next.key || prev.url !== next.url) return next.playing ? "load-play" : "load-pause";
  if (prev.playing === next.playing) return "none";
  return next.playing ? "play" : "pause";
}

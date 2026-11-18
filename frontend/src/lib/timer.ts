import type { Timer } from "./types";

/** Seconds left on a free-input timer, computed with server time. */
export function timerRemaining(timer: Timer, serverNow: number): number {
  switch (timer.status) {
    case "idle":
      return timer.total_seconds;
    case "paused":
      return timer.remaining ?? 0;
    case "running":
      return Math.max(0, (timer.deadline ?? serverNow) - serverNow);
    case "finished":
      return 0;
  }
}

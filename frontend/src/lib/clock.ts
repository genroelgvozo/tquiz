import { useCallback, useEffect, useRef, useState } from "react";

/** Returns a function giving the current *server* time (epoch seconds), corrected by the last snapshot's `now`. */
export function useServerClock(serverNow: number | undefined): () => number {
  const offset = useRef(0);
  useEffect(() => {
    if (serverNow !== undefined) offset.current = serverNow - Date.now() / 1000;
  }, [serverNow]);
  return useCallback(() => Date.now() / 1000 + offset.current, []);
}

/** Forces a re-render every `ms` milliseconds (for animated timers). */
export function useTicker(ms = 100): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

export function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

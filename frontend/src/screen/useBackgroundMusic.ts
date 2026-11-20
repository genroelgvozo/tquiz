import { useCallback, useEffect, useRef } from "react";
import type { MusicNow } from "../lib/types";
import { musicStep } from "./musicPlan";
import { isBlocked, unlockPlayer } from "./useScreenAudio";

/** The music that goes away fades out over this time, then pauses. */
export const MUSIC_FADE_MS = 1000;
const FADE_TICK_MS = 40;

/**
 * Background music: its own looping player, separate from the question audio, following `music` from the snapshot.
 * Until `unlocked` nothing plays; after it the current music starts from the beginning.
 * `onBlocked` is called if the browser refuses to play after all; the music starts again after the next unlock.
 * Returns the unlock function: call it synchronously inside the user's click so the browser lets this player make sound;
 * it resolves to false if the browser refused.
 */
export function useBackgroundMusic(
  music: MusicNow | null,
  unlocked: boolean,
  onBlocked?: () => void,
): () => Promise<boolean> {
  const player = useRef<HTMLAudioElement | null>(null);
  const blocked = useRef(onBlocked);
  blocked.current = onBlocked;
  const applied = useRef<MusicNow | null>(null); // the music the player follows now
  const fadeTimer = useRef<number | undefined>(undefined);

  if (player.current === null && typeof Audio !== "undefined") {
    player.current = new Audio();
    player.current.preload = "auto";
  }

  const stopFade = () => {
    window.clearInterval(fadeTimer.current);
    fadeTimer.current = undefined;
  };

  const url = music?.url ?? null;
  const key = music?.key ?? null;
  const playing = music?.playing ?? false;
  useEffect(() => {
    const p = player.current;
    if (!p || !unlocked) return;
    const next = url !== null && key !== null ? { url, key, playing } : null;
    const step = musicStep(applied.current, next);
    applied.current = next;
    if (step === "none") return;
    stopFade();
    if (step === "fade-out") {
      if (p.paused) return;
      const from = p.volume;
      const started = performance.now();
      fadeTimer.current = window.setInterval(() => {
        const k = Math.min(1, (performance.now() - started) / MUSIC_FADE_MS);
        p.volume = from * (1 - k);
        if (k === 1) {
          stopFade();
          p.pause();
        }
      }, FADE_TICK_MS);
      return;
    }
    p.volume = 1;
    if ((step === "load-play" || step === "load-pause") && url !== null) {
      p.loop = true;
      if (p.getAttribute("src") !== url) p.src = url;
      p.currentTime = 0;
    }
    if (step === "load-play" || step === "play")
      void p.play().catch((e: unknown) => {
        if (!isBlocked(e)) return;
        applied.current = null; // load it again after the next unlock
        blocked.current?.();
      });
    else p.pause();
  }, [url, key, playing, unlocked]);

  // on unmount stop the music; a remount (StrictMode) applies the current music again
  useEffect(
    () => () => {
      stopFade();
      player.current?.pause();
      applied.current = null;
    },
    [],
  );

  return useCallback((): Promise<boolean> => {
    const p = player.current;
    if (!p) return Promise.resolve(true); // no audio support: nothing to unlock
    p.loop = false; // the silent clip is empty: don't loop it
    return unlockPlayer(p);
  }, []);
}

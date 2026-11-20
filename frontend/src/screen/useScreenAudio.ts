import { useCallback, useEffect, useRef } from "react";
import type { AudioAction, ScreenView } from "../lib/types";

// 44-byte silent WAV used to unlock an <audio> player inside the user gesture
export const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
const AUDIO_RE = /\.(mp3|m4a|ogg|wav)$/i;

function currentAudioUrl(view: ScreenView | null): string | null {
  const media = view?.jeopardy?.question?.media ?? view?.free?.question?.media ?? null;
  return media && media.kind === "audio" ? media.url : null;
}

function apply(player: HTMLAudioElement, action: AudioAction) {
  if (action === "play") {
    void player.play().catch(() => {});
  } else if (action === "pause") {
    player.pause();
  } else if (action === "restart") {
    player.currentTime = 0;
    void player.play().catch(() => {});
  } else {
    player.pause();
    player.currentTime = 0;
  }
}

/**
 * One persistent player (so unlocking it once is enough even on Safari), driven by `view.audio.seq`.
 * Round media is warmed into the HTTP cache via `view.preload`.
 */
export function useScreenAudio(view: ScreenView | null, unlocked: boolean) {
  const player = useRef<HTMLAudioElement | null>(null);
  const lastSeq = useRef<number | null>(null);
  const warmed = useRef(new Map<string, HTMLAudioElement | HTMLImageElement>());
  const src = currentAudioUrl(view);
  const currentSrc = useRef(src);
  currentSrc.current = src;

  if (player.current === null && typeof Audio !== "undefined") {
    player.current = new Audio();
    player.current.preload = "auto";
  }

  // switch the source when the question changes
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    if (!src) {
      p.pause();
      return;
    }
    if (!p.src.endsWith(src)) {
      p.pause();
      p.src = src;
      p.load();
    }
  }, [src]);

  // apply host commands
  const seq = view?.audio.seq;
  const action = view?.audio.action;
  useEffect(() => {
    const p = player.current;
    if (!unlocked || !p || seq === undefined || action === undefined) return;
    if (lastSeq.current === seq) return;
    const first = lastSeq.current === null;
    lastSeq.current = seq;
    if (!src) return;
    if (first && action !== "play") return; // after reload only resume a playing track
    if (!p.src.endsWith(src)) {
      p.src = src;
      p.load();
    }
    apply(p, action);
  }, [seq, action, unlocked, src]);

  // preload round media
  const preload = view?.preload;
  useEffect(() => {
    for (const url of preload ?? []) {
      if (warmed.current.has(url)) continue;
      if (AUDIO_RE.test(url)) {
        const a = new Audio();
        a.preload = "auto";
        a.src = url;
        a.load();
        warmed.current.set(url, a);
      } else {
        const img = new Image();
        img.src = url;
        warmed.current.set(url, img);
      }
    }
  }, [preload]);

  /** Must be called synchronously inside the user's click so the browser lets this player make sound. */
  return useCallback(() => {
    const p = player.current;
    if (!p) return;
    const target = currentSrc.current;
    p.src = SILENT_WAV;
    void p
      .play()
      .catch(() => {})
      .finally(() => {
        if (target && p.src === SILENT_WAV) {
          p.src = target;
          p.load();
        }
      });
  }, []);
}

/** Short beep through WebAudio when someone buzzes. */
export function useBuzzBeep(answeringId: string | null | undefined, ctx: AudioContext | null) {
  const prev = useRef<string | null | undefined>(answeringId);
  useEffect(() => {
    const was = prev.current;
    prev.current = answeringId;
    if (!ctx || !answeringId || was) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.25;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  }, [answeringId, ctx]);
}

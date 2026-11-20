// Hall screen animations: timings and Motion variants as plain data, separate from the scenes' markup.
// Only `import type` here: tests load this file under node --experimental-strip-types without Motion or React.
import type { Variants } from "motion/react";

/** Server reveal duration (backend REVEAL_SECONDS): a question "starts" after it, so the animations before it fit in. */
export const REVEAL_MS = 1200;
/** One on or off of the picked cell; the blink is 4 × BLINK_MS (twice on and off). */
export const BLINK_MS = 110;
/** The picked cell expands to the whole screen. */
export const ZOOM_MS = 420;
/** Header and text of the new scene appear. */
export const CONTENT_MS = 250;
/** The big title pops up in the centre, stays, then flies into the header. */
export const TITLE_POP_MS = 350;
export const TITLE_HOLD_MS = 200;
export const TITLE_FLY_MS = 400;

export const ZOOM_TOTAL_MS = 4 * BLINK_MS + ZOOM_MS + CONTENT_MS;
export const TITLE_TOTAL_MS = TITLE_POP_MS + TITLE_HOLD_MS + TITLE_FLY_MS + CONTENT_MS;

/** Scene crossfade. */
export const FADE_IN_MS = 300;
export const FADE_OUT_MS = 250;

const sec = (ms: number) => ms / 1000;

// Every set uses the labels hidden → visible → exit.

/** Crossfade («перетекание»). */
const fade = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: sec(FADE_IN_MS), ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: sec(FADE_OUT_MS), ease: "easeIn" } },
} satisfies Variants;

/** Rises a little while appearing. */
const rise = {
  hidden: { opacity: 0, y: "3%" },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: sec(FADE_OUT_MS), ease: "easeIn" } },
} satisfies Variants;

/** Pops up with a bounce. */
const pop = {
  hidden: { opacity: 0, scale: 0.3 },
  visible: {
    opacity: [0, 1, 1, 1],
    scale: [0.3, 1.15, 0.97, 1],
    transition: { duration: 0.6, times: [0, 0.6, 0.85, 1], ease: "easeOut" },
  },
  exit: { opacity: 0, scale: 0.8, transition: { duration: 0.2, ease: "easeIn" } },
} satisfies Variants;

/** Comes in from the right, leaves to the left. */
const slide = {
  hidden: { opacity: 0, x: "6%" },
  visible: { opacity: 1, x: 0, transition: { duration: 0.34, delay: 0.12, ease: "easeOut" } },
  exit: { opacity: 0, x: "-6%", transition: { duration: 0.32, ease: "easeIn" } },
} satisfies Variants;

/** A wave of small pops; each element passes its index as `custom`. */
const staggerPop = {
  hidden: { opacity: 0, scale: 0.6 },
  visible: (i: number) => ({
    opacity: [0, 1, 1],
    scale: [0.6, 1.06, 1],
    transition: { duration: 0.32, times: [0, 0.7, 1], delay: i * 0.022, ease: "easeOut" },
  }),
  exit: { opacity: 0, transition: { duration: sec(FADE_OUT_MS), ease: "easeIn" } },
} satisfies Variants;

export const variants = { fade, rise, pop, slide, staggerPop };

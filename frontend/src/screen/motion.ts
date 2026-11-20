// Hall screen animations: timings and Motion variants as plain data, separate from the scenes' markup.
// Only `import type` here: tests load this file under node --experimental-strip-types without Motion or React.
import type { Transition, Variants } from "motion/react";
import type { Entrance } from "./scene";

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

/** The picked cell expanding and the big title flying into the header: quick start, soft landing. */
const MOVE_EASE = [0.5, 0, 0.2, 1] as const;

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

/** Board cells: a wave of small pops when the board comes in. No exit: the board leaves as a whole. */
const boardCell = { hidden: staggerPop.hidden, visible: staggerPop.visible } satisfies Variants;

/**
 * The scene the picked cell expands into: there at once, its expanding cell draws the entrance.
 * The board under it goes when the cell has covered the screen.
 */
const expandScene = {
  hidden: { opacity: 1 },
  visible: { opacity: 1 },
  exit: { opacity: 0, transition: { delay: sec(ZOOM_MS), duration: 0 } },
} satisfies Variants;

/**
 * The picked cell (it shares the cell's layoutId) grows from its place to the whole screen while its colour goes
 * from the accent to the background, then it fades away over the question appearing under it.
 */
const cellExpand = {
  hidden: { backgroundColor: "var(--accent)", opacity: 1 },
  visible: { backgroundColor: "var(--bg)", opacity: 0 },
} satisfies Variants;
export const cellExpandTransition = {
  layout: { duration: sec(ZOOM_MS), ease: MOVE_EASE },
  backgroundColor: { duration: sec(ZOOM_MS), ease: MOVE_EASE },
  opacity: { delay: sec(ZOOM_MS), duration: sec(CONTENT_MS), ease: "easeOut" },
} satisfies Transition;

/**
 * A part of a question scene (the header, the body) appearing on its own after the scene's entrance.
 * `custom` is the delay in ms after the part mounts (see partDelays), or null: the part comes with the scene itself.
 */
const part = {
  hidden: (delay: number | null) => (delay === null ? {} : { opacity: 0, y: "3%" }),
  visible: (delay: number | null) => ({
    opacity: 1,
    y: 0,
    transition: delay === null ? { duration: 0 } : { duration: sec(CONTENT_MS), delay: sec(delay), ease: "easeOut" },
  }),
} satisfies Variants;

/**
 * When the header, its muted tail and the body of a question appear, in ms after they mount, by how the scene came in.
 * The tail is inside the header: null means it comes with the header.
 */
export function partDelays(entrance: Entrance): { head: number | null; tail: number | null; body: number | null } {
  switch (entrance) {
    case "zoom":
      return { head: ZOOM_MS, tail: null, body: ZOOM_MS };
    case "title":
      // the header is where the big title lands, so it is there at once; its tail and the body follow the flight
      return { head: null, tail: TITLE_FLY_MS, body: TITLE_FLY_MS };
    default:
      return { head: null, tail: null, body: null };
  }
}

/** The big title in the centre: pops up, then (TitleIntro) flies into the header. */
const bigTitle = {
  hidden: { opacity: 0, scale: 0.4 },
  visible: {
    opacity: [0, 1, 1],
    scale: [0.4, 1.1, 1],
    transition: { duration: sec(TITLE_POP_MS), times: [0, 0.7, 1], ease: "easeOut" },
  },
} satisfies Variants;
export const titleFlyTransition = { layout: { duration: sec(TITLE_FLY_MS), ease: MOVE_EASE } } satisfies Transition;

/** The question text steps back (from its top left corner) while the answer is shown. */
const textStep = {
  normal: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: "easeOut" } },
  dim: { opacity: 0.55, scale: 0.9, transition: { duration: 0.3, ease: "easeOut" } },
} satisfies Variants;

/** «Отвечает: …»: pops up, slides aside when it goes. */
const who = {
  hidden: pop.hidden,
  visible: { ...pop.visible, transition: { ...pop.visible.transition, duration: 0.45 } },
  exit: { opacity: 0, x: "12%", transition: { duration: 0.25, ease: "easeIn" } },
} satisfies Variants;

/** «Секрет!»: pops up, then wobbles a little. */
const secret = {
  hidden: { opacity: 0, scale: 0.3, rotate: 0 },
  visible: {
    opacity: [0, 1, 1, 1],
    scale: [0.3, 1.15, 0.97, 1],
    rotate: [0, -6, 5, -3, 0],
    transition: {
      default: { duration: 0.6, times: [0, 0.6, 0.85, 1], ease: "easeOut" },
      rotate: { delay: 0.55, duration: 0.5, ease: "easeInOut" },
    },
  },
} satisfies Variants;

export const variants = {
  fade,
  rise,
  pop,
  slide,
  staggerPop,
  boardCell,
  expandScene,
  cellExpand,
  part,
  bigTitle,
  textStep,
  who,
  secret,
};

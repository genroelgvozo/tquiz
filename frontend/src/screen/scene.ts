// Hall screen as a sequence of scenes. Animations only know scenes and the change of one scene to another.
// Only type imports: tests load this file under node --experimental-strip-types without Motion or React.
import type { ScreenView } from "../lib/types.ts";

export type Scene =
  | { kind: "blank"; key: "blank" }
  | { kind: "lobby"; key: "lobby" }
  | { kind: "intro"; key: string } // intro:{round}
  | { kind: "board"; key: string } // board:{round}
  | { kind: "secret"; key: string; questionId: number } // secret:{qid}
  | { kind: "jq"; key: string; questionId: number } // jq:{qid}: a jeopardy question and its answer
  | { kind: "free"; key: string; number: number } // free:{round}:{number}
  | { kind: "review"; key: string; number: number } // review:{round}: the number changes inside the scene
  | { kind: "winner"; key: "winner" };

/** How the new scene comes in: none (instantly), a crossfade, the picked cell expanding, the big title flying in. */
export type Entrance = "none" | "fade" | "zoom" | "title";

export interface Transition {
  entrance: Entrance;
  /** How long the previous scene stays (the picked cell blinks) before the new one comes in. */
  holdMs: number;
}

/**
 * The cell blink: 4 × BLINK_MS from motion.ts. A literal, because this module imports only types;
 * tests/scene.test.ts checks that it matches.
 */
const BLINK_HOLD_MS = 440;

const BLANK: Scene = { kind: "blank", key: "blank" };

export function sceneOf(view: ScreenView | null): Scene {
  if (!view) return BLANK;
  const round = view.round?.index ?? 0;
  switch (view.stage) {
    case "lobby":
      return { kind: "lobby", key: "lobby" };
    case "intro":
      return view.round ? { kind: "intro", key: `intro:${view.round.index}` } : BLANK;
    case "finished":
      return { kind: "winner", key: "winner" };
    case "jeopardy": {
      const j = view.jeopardy;
      if (!j) return BLANK;
      const id = j.question_id;
      if (j.phase === "board" || j.question === null || id === null) return { kind: "board", key: `board:${round}` };
      if (j.phase === "secret") return { kind: "secret", key: `secret:${id}`, questionId: id };
      return { kind: "jq", key: `jq:${id}`, questionId: id };
    }
    case "free": {
      const f = view.free;
      if (!f) return BLANK;
      if (f.phase === "review") return { kind: "review", key: `review:${round}`, number: f.number };
      return { kind: "free", key: `free:${round}:${f.number}`, number: f.number };
    }
  }
}

/**
 * The scene for the stage under the standings overlay. The overlay covers the stage, so while it is open the stage keeps
 * the scene it showed when the overlay opened (`frozen`): a scene that changed under the overlay plays its entrance once
 * the overlay clears, and one that didn't change doesn't replay it. Without a frozen scene (the first snapshot after
 * loading or reconnecting) the snapshot's own scene.
 */
export function stageScene(frozen: Scene | null, view: ScreenView | null): Scene {
  return view?.overlay && frozen !== null ? frozen : sceneOf(view);
}

export function planTransition(prev: Scene | null, next: Scene): Transition {
  if (prev === null || prev.key === next.key) return { entrance: "none", holdMs: 0 };
  if (next.kind === "jq") {
    if (prev.kind === "board") return { entrance: "zoom", holdMs: BLINK_HOLD_MS };
    // no cell on the screen to expand from (e.g. answer → straight to the next cell): the title flies in
    if (prev.kind !== "secret") return { entrance: "title", holdMs: 0 };
  }
  if (next.kind === "free") return { entrance: "title", holdMs: 0 };
  if (next.kind === "review" && prev.kind !== "review") return { entrance: "title", holdMs: 0 };
  return { entrance: "fade", holdMs: 0 };
}

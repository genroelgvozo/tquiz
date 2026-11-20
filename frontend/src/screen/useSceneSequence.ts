import { useEffect, useState } from "react";
import { planTransition, type Entrance, type Scene } from "./scene";

export interface SceneSequence {
  /** The scene on the screen now; during the cell blink it is still the board. */
  shown: Scene;
  /** How `shown` came in. */
  entrance: Entrance;
  /** The jeopardy question whose cell blinks before it expands, or null. */
  blinkId: number | null;
}

interface Held {
  scene: Scene;
  entrance: Entrance;
  holdMs: number;
}

interface SequenceState {
  /** The latest scene received. */
  newest: Scene;
  shown: Scene;
  entrance: Entrance;
  /** The newest scene waiting while the shown one plays its part (the blink). */
  held: Held | null;
}

const sameScene = (a: Scene, b: Scene) => JSON.stringify(a) === JSON.stringify(b);

function advance(s: SequenceState, newest: Scene): SequenceState {
  // always planned from the scene on the screen: a newer snapshot during the blink replaces the waiting one
  const plan = planTransition(s.shown, newest);
  if (plan.holdMs > 0) return { ...s, newest, held: { scene: newest, entrance: plan.entrance, holdMs: plan.holdMs } };
  // same key: the scene stays mounted, so it keeps the entrance it came in with
  const entrance = s.shown.key === newest.key ? s.entrance : plan.entrance;
  return { newest, shown: newest, entrance, held: null };
}

/** Turns the stream of scenes from snapshots into what the screen shows, holding the board while a cell blinks. */
export function useSceneSequence(scene: Scene): SceneSequence {
  const [state, setState] = useState<SequenceState>(() => ({ newest: scene, shown: scene, entrance: "none", held: null }));

  // derived during render, so the shown scene never lags one render behind the snapshot it is drawn from
  let current = state;
  if (!sameScene(scene, state.newest)) {
    current = advance(state, scene);
    setState(current);
  }

  const held = current.held;
  useEffect(() => {
    if (!held) return;
    const timer = window.setTimeout(() => {
      setState((s) => (s.held === held ? { ...s, shown: held.scene, entrance: held.entrance, held: null } : s));
    }, held.holdMs);
    return () => window.clearTimeout(timer);
  }, [held]);

  const blinkId = held && held.scene.kind === "jq" ? held.scene.questionId : null;
  return { shown: current.shown, entrance: current.entrance, blinkId };
}

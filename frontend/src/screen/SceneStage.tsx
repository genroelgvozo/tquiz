import { AnimatePresence, LayoutGroup, motion, type TargetAndTransition, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { variants } from "./motion";
import type { Entrance, Scene } from "./scene";
import { useSceneSequence, type SceneSequence } from "./useSceneSequence";

// How a scene comes in and how the previous one leaves, by the entrance of the new one.
// zoom: the new scene is there at once and its expanding cell covers the board, which then goes.
// title: a crossfade; the big title pops up inside the new scene (TitleIntro).
type SceneSet = Record<"hidden" | "visible" | "exit", TargetAndTransition>;
const SCENE_VARIANTS: Record<Entrance, SceneSet> = {
  none: variants.fade,
  fade: variants.fade,
  zoom: variants.expandScene,
  title: variants.fade,
};

// resolved with `custom`: the leaving scene gets the entrance of the one replacing it from AnimatePresence
const sceneVariants: Variants = {
  hidden: (e: Entrance) => SCENE_VARIANTS[e].hidden,
  visible: (e: Entrance) => SCENE_VARIANTS[e].visible,
  exit: (e: Entrance) => SCENE_VARIANTS[e].exit,
};

/**
 * Shows the scene, animating the change from one scene to another. The scenes overlap while they change.
 * The first scene after mounting is drawn at once: remount it (change `key`) to draw a snapshot without animation.
 */
export function SceneStage({ scene, children }: { scene: Scene; children: (seq: SceneSequence) => ReactNode }) {
  const seq = useSceneSequence(scene);
  return (
    <LayoutGroup>
      <AnimatePresence initial={false} custom={seq.entrance}>
        <motion.div
          key={seq.shown.key}
          className="scr-scene"
          custom={seq.entrance}
          variants={sceneVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {children(seq)}
        </motion.div>
      </AnimatePresence>
    </LayoutGroup>
  );
}

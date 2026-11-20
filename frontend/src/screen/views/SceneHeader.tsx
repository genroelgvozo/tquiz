import { AnimatePresence, motion } from "motion/react";
import { variants } from "../motion";

/** The layoutId shared by a scene's header and its big title (TitleIntro), so the title flies into the header. */
export const HEAD_LAYOUT_ID = "scene-head";

/**
 * Bold header at the top left, next to the logo: the main part in the accent colour, the tail muted.
 * A new tail crossfades with the old one in place. `tailDelay`: the tail appears on its own that many ms after it
 * mounts (after a title has flown into the main part); null: with the header.
 */
export function SceneHeader({
  main,
  tail,
  layoutId,
  tailDelay = null,
}: {
  main: string;
  tail?: string;
  layoutId?: string;
  tailDelay?: number | null;
}) {
  return (
    <div className="scr-head">
      <motion.strong className="scr-head-main" layoutId={layoutId}>
        {main}
      </motion.strong>
      {tail && (
        <motion.span className="scr-head-tail" variants={variants.part} custom={tailDelay}>
          {/* popLayout: the leaving tail is lifted out of the line, so the new one takes its place at once */}
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span key={tail} variants={variants.fade} initial="hidden" animate="visible" exit="exit">
              {tail}
            </motion.span>
          </AnimatePresence>
        </motion.span>
      )}
    </div>
  );
}

import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { TITLE_HOLD_MS, TITLE_POP_MS, titleFlyTransition, variants } from "../motion";

/**
 * The big title of a new scene: it pops up in the centre, then `children` are drawn and their SceneHeader with the same
 * `layoutId` takes the title over, so it flies into the header. Without `play` the children are drawn at once.
 */
export function TitleIntro({
  title,
  layoutId,
  play,
  children,
}: {
  title: string;
  layoutId: string;
  play: boolean;
  children: ReactNode;
}) {
  const [big, setBig] = useState(play);
  useEffect(() => {
    if (!big) return;
    const timer = window.setTimeout(() => setBig(false), TITLE_POP_MS + TITLE_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [big]);
  // A group of its own: the big title must not take off from the leaving scene's header (it has the same layoutId).
  const group = useId();
  return (
    <LayoutGroup id={group}>
      {/* the header's layout animation (the flight) takes the default transition */}
      <MotionConfig transition={titleFlyTransition}>
        {big ? (
          <div className="scr-title-intro">
            <motion.strong
              className="scr-title-big"
              layoutId={layoutId}
              variants={variants.bigTitle}
              initial="hidden"
              animate="visible"
            >
              {title}
            </motion.strong>
          </div>
        ) : (
          children
        )}
      </MotionConfig>
    </LayoutGroup>
  );
}

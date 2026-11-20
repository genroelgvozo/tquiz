import { motion } from "motion/react";

/** Bold header at the top left, next to the logo: the main part in the accent colour, the tail muted. */
export function SceneHeader({ main, tail, layoutId }: { main: string; tail?: string; layoutId?: string }) {
  return (
    <div className="scr-head">
      <motion.strong className="scr-head-main" layoutId={layoutId}>
        {main}
      </motion.strong>
      {tail && <span className="scr-head-tail">{tail}</span>}
    </div>
  );
}

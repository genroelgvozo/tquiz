import { motion } from "motion/react";
import { variants } from "../motion";
import type { RoundPublic } from "../../lib/types";

export default function IntroView({ round }: { round: RoundPublic }) {
  return (
    <div className="scr-center">
      <motion.div className="scr-muted scr-h3" variants={variants.introLine} custom={0}>
        Тур {round.index + 1} из {round.total}
      </motion.div>
      <motion.div className="scr-h1" variants={variants.introTitle}>
        {round.title}
      </motion.div>
      <motion.div className="scr-accent scr-h3" variants={variants.introLine} custom={2}>
        {round.kind === "jeopardy" ? "Своя игра" : "Свободный ввод"}
      </motion.div>
    </div>
  );
}

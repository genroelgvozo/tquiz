import { AnimatePresence, motion } from "motion/react";
import type { ScreenFree } from "../../lib/types";
import { partDelays, variants } from "../motion";
import { QuestionBody } from "./QuestionView";
import { HEAD_LAYOUT_ID, SceneHeader } from "./SceneHeader";
import { TitleIntro } from "./TitleIntro";

const TITLE = "Правильные ответы";

/**
 * The review of a free-input round: one scene for all its questions. With `play` the big «Правильные ответы» flies into
 * the header first. The header then stays, only the number in its tail changes; the question's body leaves to the left
 * and the next one comes in from the right. The answer pops up when the host shows it.
 */
export default function ReviewView({ free, play }: { free: ScreenFree; play: boolean }) {
  const delays = partDelays(play ? "title" : "none");
  return (
    <TitleIntro title={TITLE} layoutId={HEAD_LAYOUT_ID} play={play}>
      <div className="scr-question">
        <motion.div className="scr-head-slot" variants={variants.part} custom={delays.head}>
          <SceneHeader
            main={TITLE}
            tail={` · вопрос ${free.number} из ${free.total}`}
            layoutId={HEAD_LAYOUT_ID}
            tailDelay={delays.tail}
          />
        </motion.div>
        <motion.div className="scr-q-slides" variants={variants.part} custom={delays.body}>
          {/* popLayout: the leaving body is lifted out of the column, so both slide at once in the same place */}
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={free.number}
              className="scr-q-body"
              variants={variants.slide}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <QuestionBody q={free.question} />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </TitleIntro>
  );
}

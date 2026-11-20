import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import type { ScreenQuestion, TypingView } from "../../lib/types";
import { partDelays, variants } from "../motion";
import type { Entrance } from "../scene";
import { SceneHeader } from "./SceneHeader";
import { TypedText } from "./TypedText";

export default function QuestionView({
  q,
  head,
  footer,
  entrance = "none",
  typing = null,
  now,
  dimText = false,
}: {
  q: ScreenQuestion;
  /** Header next to the logo: `main` bold in the accent colour, `tail` muted. */
  head: { main: string; tail?: string; layoutId?: string };
  footer?: ReactNode;
  /** How the scene came in: after the cell expands or the title flies in, the header and the body come on their own. */
  entrance?: Entrance;
  /** Letter-by-letter printing of the text (needs `now`); null: the whole text. */
  typing?: TypingView | null;
  now?: () => number;
  /** The text steps back while the answer is shown. */
  dimText?: boolean;
}) {
  const delays = partDelays(entrance);
  return (
    <div className="scr-question">
      <motion.div className="scr-head-slot" variants={variants.part} custom={delays.head}>
        <SceneHeader main={head.main} tail={head.tail} layoutId={head.layoutId} />
      </motion.div>
      <motion.div className="scr-q-body" variants={variants.part} custom={delays.body}>
        <motion.div
          className="scr-q-text"
          variants={variants.textStep}
          initial={false}
          animate={dimText ? "dim" : "normal"}
        >
          {typing && now ? <TypedText text={q.text ?? ""} typing={typing} now={now} /> : q.text}
        </motion.div>
        {q.media?.kind === "image" && (
          <div className="scr-q-image">
            <img src={q.media.url} alt="" />
          </div>
        )}
        {q.media?.kind === "audio" && <div className="scr-q-audio">♪</div>}
        {q.options.length > 0 && (
          <ol className="scr-options" type="A">
            {q.options.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ol>
        )}
        {/* its own presence: an answer already there when the scene is drawn shows at once, a new one pops up */}
        <AnimatePresence initial={false}>
          {q.answer !== null && (
            <motion.div
              key="answer"
              className="scr-answer"
              variants={variants.pop}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              Ответ: <span className="scr-accent">{q.answer}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="scr-q-footer">{footer}</div>
      </motion.div>
    </div>
  );
}

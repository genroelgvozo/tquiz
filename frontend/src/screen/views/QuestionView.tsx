import type { ReactNode } from "react";
import type { ScreenQuestion } from "../../lib/types";
import { SceneHeader } from "./SceneHeader";

export default function QuestionView({
  q,
  head,
  footer,
  dimText = false,
}: {
  q: ScreenQuestion;
  /** Header next to the logo: `main` bold in the accent colour, `tail` muted. */
  head: { main: string; tail?: string };
  footer?: ReactNode;
  dimText?: boolean;
}) {
  return (
    <div className="scr-question">
      <SceneHeader main={head.main} tail={head.tail} />
      <div className={`scr-q-text ${dimText ? "dim" : ""}`}>{q.text}</div>
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
      {q.answer !== null && (
        <div className="scr-answer">
          Ответ: <span className="scr-accent">{q.answer}</span>
        </div>
      )}
      <div className="scr-q-footer">{footer}</div>
    </div>
  );
}

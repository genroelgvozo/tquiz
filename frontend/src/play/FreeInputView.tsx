import { useEffect, useRef, useState } from "react";
import { PhaseTimerBar } from "../components/PhaseTimerBar";
import { useTicker } from "../lib/clock";
import type { SocketStatus } from "../lib/socket";
import { timerRemaining } from "../lib/timer";
import type { Answer, TeamFree } from "../lib/types";

const same = (a: Answer, b: Answer) => a.text === b.text && a.option === b.option && a.stake === b.stake;

/** Answer is sent on every change, no submit button, no debounce. */
export default function FreeInputView({
  free,
  questionKey,
  now,
  status,
  send,
}: {
  free: TeamFree;
  questionKey: string;
  now: () => number;
  status: SocketStatus;
  send: (cmd: object) => boolean;
}) {
  useTicker(250);
  const [draft, setDraft] = useState<Answer>(free.answer);
  const unsent = useRef(false);

  // new question → start from what the server has
  useEffect(() => {
    setDraft(free.answer);
    unsent.current = false;
  }, [questionKey]);

  const timeUp = free.timer.status !== "idle" && timerRemaining(free.timer, now()) <= 0;
  const locked = !free.input_open || timeUp;

  const push = (next: Answer) => {
    setDraft(next);
    const ok = send({ type: "answer", text: next.text, option: next.option, stake: next.stake });
    unsent.current = !ok;
  };

  // socket came back: resend what the server may not have
  useEffect(() => {
    if (status === "open" && unsent.current && !locked) {
      unsent.current = !send({ type: "answer", text: draft.text, option: draft.option, stake: draft.stake });
    }
  }, [status, locked, draft, send]);

  if (free.phase === "review") {
    return (
      <div className="play-center">
        <div className="play-title">Идёт разбор</div>
      </div>
    );
  }

  const saved = same(draft, free.answer);

  return (
    <div className="play-free">
      <div className="play-muted">
        Вопрос {free.number} из {free.total}
      </div>
      <PhaseTimerBar timer={free.timer} now={now} />

      {free.options.length > 0 ? (
        <div className="play-options">
          {free.options.map((opt, i) => (
            <button
              key={i}
              className={`play-option ${draft.option === i ? "selected" : ""}`}
              disabled={locked}
              onClick={() => push({ ...draft, option: i })}
            >
              <b>{String.fromCharCode(65 + i)}.</b> {opt}
            </button>
          ))}
        </div>
      ) : (
        <textarea
          className="play-textarea"
          value={draft.text}
          disabled={locked}
          maxLength={500}
          placeholder="Ваш ответ"
          onChange={(e) => push({ ...draft, text: e.target.value })}
        />
      )}

      {free.stakes && (
        <label className={`play-toggle ${draft.stake ? "on" : ""}`}>
          <input
            type="checkbox"
            checked={draft.stake}
            disabled={locked}
            onChange={(e) => push({ ...draft, stake: e.target.checked })}
          />
          <span className="switch" />
          Ставка (×2 / −1)
        </label>
      )}

      <div className="play-caption">
        {locked ? "Приём ответов закрыт" : saved ? "сохранено ✓" : "сохраняем…"}
      </div>
    </div>
  );
}

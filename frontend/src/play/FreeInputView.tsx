import { useEffect, useRef, useState } from "react";
import { PhaseTimerBar } from "../components/PhaseTimerBar";
import { useTicker } from "../lib/clock";
import type { SocketStatus } from "../lib/socket";
import { timerRemaining } from "../lib/timer";
import type { Answer, TeamFree } from "../lib/types";

const same = (a: Answer, b: Answer) => a.text === b.text && a.option === b.option && a.stake === b.stake;
const RESEND_AFTER_MS = 1500;

/**
 * Answer is sent on every change, no submit button, no debounce. Every send carries the question id,
 * so a late or resent draft can never land on another question. If the server's copy still differs
 * from the draft a moment later (lost on a dead socket, reconnect), the draft is sent again.
 */
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
  const lastSent = useRef(0);

  // new question → start from what the server has
  useEffect(() => {
    setDraft(free.answer);
  }, [questionKey]);

  const timeUp = free.timer.status !== "idle" && timerRemaining(free.timer, now()) <= 0;
  const locked = !free.input_open || timeUp;

  const sendDraft = (d: Answer) => {
    lastSent.current = Date.now();
    send({ type: "answer", question_id: free.question_id, text: d.text, option: d.option, stake: d.stake });
  };

  const push = (next: Answer) => {
    setDraft(next);
    sendDraft(next);
  };

  // latest values for the retry timer
  const latest = useRef({ draft, free, locked, status, sendDraft });
  latest.current = { draft, free, locked, status, sendDraft };
  useEffect(() => {
    const id = window.setInterval(() => {
      const { draft: d, free: f, locked: l, status: s, sendDraft: resend } = latest.current;
      if (l || s !== "open" || f.phase !== "question") return;
      if (!same(d, f.answer) && Date.now() - lastSent.current > RESEND_AFTER_MS) resend(d);
    }, 500);
    return () => window.clearInterval(id);
  }, []);

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

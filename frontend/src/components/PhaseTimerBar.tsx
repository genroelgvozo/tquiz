import { formatSeconds, useTicker } from "../lib/clock";
import { timerRemaining } from "../lib/timer";
import type { Timer } from "../lib/types";

/** Two-phase timer: "Обсуждение" (yellow) then "Ввод ответа" (blue). */
export function PhaseTimerBar({ timer, now }: { timer: Timer; now: () => number }) {
  useTicker(100);
  const total = Math.max(timer.total_seconds, 1);
  const input = Math.min(timer.input_seconds, total);
  const discuss = total - input;
  const left = timerRemaining(timer, now());
  const elapsed = total - left;
  const inDiscuss = left > input;

  let label: string;
  if (timer.status === "finished") label = "Время вышло";
  else if (timer.status === "paused") label = `Пауза · ${formatSeconds(left)}`;
  else if (inDiscuss) label = `Обсуждение · ${formatSeconds(left - input)}`;
  else label = `Ввод ответа · ${formatSeconds(left)}`;

  const discussFill = discuss > 0 ? Math.min(elapsed, discuss) / discuss : 1;
  const inputFill = input > 0 ? Math.max(0, elapsed - discuss) / input : 1;

  return (
    <div className={`phase-timer ${inDiscuss ? "is-discuss" : "is-input"} status-${timer.status}`}>
      <div className="phase-timer-labels">
        <span className="phase-timer-label">{label}</span>
        {timer.status === "idle" && <span className="phase-timer-hint">ждём старта</span>}
      </div>
      <div className="phase-timer-track">
        {discuss > 0 && (
          <div className="phase-seg seg-discuss" style={{ flexGrow: discuss }}>
            <div className="phase-fill" style={{ width: `${discussFill * 100}%` }} />
          </div>
        )}
        {input > 0 && (
          <div className="phase-seg seg-input" style={{ flexGrow: input }}>
            <div className="phase-fill" style={{ width: `${inputFill * 100}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

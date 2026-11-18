import { PhaseTimerBar } from "../../components/PhaseTimerBar";
import { useServerClock } from "../../lib/clock";
import type { PanelProps } from "./types";

export default function FreePanel({ view, send }: PanelProps) {
  const round = view.quiz.rounds[view.state.round_index];
  const free = view.state.free;
  const now = useServerClock(view.now);
  if (!round || !free) return null;
  const q = round.questions[free.index];
  const total = round.questions.length;
  const answers = free.answers[String(q.id)] ?? {};
  const t = free.timer;

  return (
    <div className="card console-pane">
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" disabled={free.index === 0} onClick={() => send({ type: "open_question", index: free.index - 1 })}>
          ←
        </button>
        <b>
          Вопрос {free.index + 1} / {total}
        </b>
        <button
          className="btn"
          disabled={free.index >= total - 1}
          onClick={() => send({ type: "open_question", index: free.index + 1 })}
        >
          →
        </button>
        <span style={{ flex: 1 }} />
        <button className={`btn ${free.index >= total - 1 ? "primary" : ""}`} onClick={() => send({ type: "start_review" })}>
          Начать разбор
        </button>
      </div>

      <div className="qbox">
        {q.text || <span className="muted">(без текста)</span>}
        {q.options.length > 0 && (
          <ol type="A" style={{ margin: "8px 0 0", paddingLeft: 22 }}>
            {q.options.map((o, i) => (
              <li key={i} style={{ fontWeight: i === q.correct_option ? 700 : 400 }}>
                {o} {i === q.correct_option && "✓"}
              </li>
            ))}
          </ol>
        )}
        <div className="answer">
          Ответ: {q.answer || "—"} · номинал {q.nominal}
        </div>
      </div>

      {q.media?.kind === "audio" && (
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn" onClick={() => send({ type: "audio", action: "play" })}>
            ▶ Музыка
          </button>
          <button className="btn" onClick={() => send({ type: "audio", action: "pause" })}>
            ⏸
          </button>
          <button className="btn" onClick={() => send({ type: "audio", action: "restart" })}>
            ↺ С начала
          </button>
        </div>
      )}

      <div className="light-timer" style={{ marginBottom: 12 }}>
        <PhaseTimerBar timer={t} now={now} />
      </div>
      <div className="row">
        {t.status === "idle" && (
          <button className="btn primary" onClick={() => send({ type: "timer_start" })}>
            Запустить таймер
          </button>
        )}
        {t.status === "running" && (
          <button className="btn" onClick={() => send({ type: "timer_pause" })}>
            Пауза
          </button>
        )}
        {t.status === "paused" && (
          <button className="btn" onClick={() => send({ type: "timer_resume" })}>
            Продолжить
          </button>
        )}
        {(t.status === "running" || t.status === "paused") && (
          <>
            <button className="btn" onClick={() => send({ type: "timer_add" })}>
              +10 с
            </button>
            <button className="btn" onClick={() => send({ type: "timer_finish" })}>
              Завершить
            </button>
          </>
        )}
        {t.status === "finished" && <span className="muted">Время вышло</span>}
      </div>

      <div className="answered-list">
        {view.state.teams.map((team) => {
          const a = answers[team.id];
          const done = !!a && (a.text.trim() !== "" || a.option !== null);
          return (
            <span key={team.id} className={`chip ${done ? "done" : ""}`}>
              {done ? "✓ " : ""}
              {team.name}
            </span>
          );
        })}
      </div>
    </div>
  );
}

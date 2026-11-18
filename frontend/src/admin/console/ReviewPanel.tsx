import type { PanelProps } from "./types";

export default function ReviewPanel({ view, send }: PanelProps) {
  const round = view.quiz.rounds[view.state.round_index];
  const free = view.state.free;
  if (!round || !free) return null;
  const q = round.questions[free.review_index];
  const total = round.questions.length;
  const answers = free.answers[String(q.id)] ?? {};
  const marks = free.marks[String(q.id)] ?? {};

  const mark = (teamId: string, value: boolean) => {
    const next = marks[teamId] === value ? null : value; // clicking the active mark clears it
    send({ type: "mark", question_id: q.id, team_id: teamId, correct: next });
  };

  return (
    <div className="card console-pane">
      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn" disabled={free.review_index === 0} onClick={() => send({ type: "review_goto", index: free.review_index - 1 })}>
          ← Вопрос {free.review_index}
        </button>
        <b>
          Разбор {free.review_index + 1} / {total}
        </b>
        <button
          className="btn"
          disabled={free.review_index >= total - 1}
          onClick={() => send({ type: "review_goto", index: free.review_index + 1 })}
        >
          Вопрос {free.review_index + 2} →
        </button>
      </div>

      <div className="qbox">
        {q.text || <span className="muted">(без текста)</span>}
        <div className="answer">
          Ответ: {q.options.length > 0 && q.correct_option !== null ? `${String.fromCharCode(65 + q.correct_option)}. ${q.options[q.correct_option]}` : q.answer || "—"} · номинал {q.nominal}
        </div>
      </div>

      {view.state.teams.map((team) => {
        const a = answers[team.id];
        let shown: string | null = null;
        if (a && q.options.length > 0 && a.option !== null) shown = `${String.fromCharCode(65 + a.option)}. ${q.options[a.option] ?? ""}`;
        else if (a && a.text.trim()) shown = a.text;
        const m = marks[team.id];
        return (
          <div className="review-row" key={team.id}>
            <b>{team.name}</b>
            <span>
              {shown ?? <span className="muted">— нет ответа —</span>} {a?.stake && <span className="chip yellow">ставка</span>}
            </span>
            <span className="row">
              <button className={`btn ${m === true ? "ok" : ""}`} onClick={() => mark(team.id, true)}>
                ✓
              </button>
              <button className={`btn ${m === false ? "no" : ""}`} onClick={() => mark(team.id, false)}>
                ✗
              </button>
            </span>
          </div>
        );
      })}
      <p className="muted" style={{ marginTop: 10 }}>
        Совпадения с эталоном и варианты отмечены заранее — проверь и поправь при необходимости.
      </p>
    </div>
  );
}

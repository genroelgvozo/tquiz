import type { QuestionData } from "../../lib/types";
import type { PanelProps } from "./types";

export default function JeopardyPanel({ view, send }: PanelProps) {
  const round = view.quiz.rounds[view.state.round_index];
  const j = view.state.jeopardy;
  if (!round || !j) return null;
  const teams = view.state.teams;
  const name = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "—";
  const columns = Math.max(1, ...round.categories.map((c) => c.questions.length));

  let current: QuestionData | undefined;
  let currentCat = "";
  for (const c of round.categories) {
    const found = c.questions.find((q) => q.id === j.question_id);
    if (found) {
      current = found;
      currentCat = c.name;
    }
  }
  const hasAudio = current?.media?.kind === "audio";
  const canOpen = j.phase === "board" || j.phase === "answer";
  const firstAt = j.buzzes[0]?.at ?? 0;

  return (
    <div className="card console-pane">
      <div className="grid-2" style={{ gridTemplateColumns: "minmax(220px, 1fr) 1.4fr", alignItems: "start" }}>
        <div>
          <p className="label">Сетка — клик открывает вопрос</p>
          <div className="mini-grid" style={{ gridTemplateColumns: `1.3fr repeat(${columns}, 1fr)` }}>
            {round.categories.map((c) => (
              <div key={c.id} style={{ display: "contents" }}>
                <div className="cat" title={c.name}>
                  {c.name}
                </div>
                {Array.from({ length: columns }, (_, i) => {
                  const q = c.questions[i];
                  if (!q) return <span key={i} />;
                  const played = j.played.includes(q.id);
                  return (
                    <button
                      key={q.id}
                      className={`${played ? "played" : ""} ${q.id === j.question_id ? "current" : ""}`}
                      disabled={played || !canOpen}
                      title={q.is_secret ? "секрет" : q.text}
                      onClick={() => send({ type: "open_cell", question_id: q.id })}
                    >
                      {q.value}
                      {q.is_secret ? "🎁" : ""}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="label">Выбирает</p>
          <select
            value={j.chooser_team_id ?? ""}
            disabled={!canOpen}
            onChange={(e) => send({ type: "set_chooser", team_id: e.target.value })}
            style={{ border: "1px solid var(--light-border)", borderRadius: 6, padding: "5px 8px" }}
          >
            <option value="" disabled>
              — выберите —
            </option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          {!current || j.phase === "board" ? (
            <p className="muted">
              {j.played.length === round.categories.reduce((n, c) => n + c.questions.length, 0)
                ? "Все вопросы сыграны — переходите к следующему туру."
                : "Выберите вопрос в сетке."}
            </p>
          ) : (
            <>
              <p className="label">
                {currentCat} · {current.value} {current.is_secret && "· секрет"}
              </p>
              <div className="qbox">
                {current.text || <span className="muted">(без текста)</span>}
                <div className="answer">Ответ: {current.answer || "—"}</div>
              </div>

              {hasAudio && (
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

              {j.phase === "secret" && (
                <div className="buzz-box">
                  <div className="who">Кому передать секрет?</div>
                  <div className="row">
                    {teams
                      .filter((t) => t.id !== j.chooser_team_id)
                      .map((t) => (
                        <button key={t.id} className="btn" onClick={() => send({ type: "set_secret_recipient", team_id: t.id })}>
                          {t.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {j.phase === "question" && (
                <div className="buzz-box">
                  {j.answering_team_id ? (
                    <>
                      <div className="who">
                        Отвечает: <b>{name(j.answering_team_id)}</b>
                        {j.buzzes.length > 1 && (
                          <span className="muted">
                            {" "}
                            {j.buzzes
                              .slice(1)
                              .map((b) => `${name(b.team_id)} +${(b.at - firstAt).toFixed(2)} с`)
                              .join(", ")}
                          </span>
                        )}
                      </div>
                      <div className="row">
                        <button className="btn ok" onClick={() => send({ type: "judge", correct: true })}>
                          ✓ Верно +{current.value}
                        </button>
                        <button className="btn no" onClick={() => send({ type: "judge", correct: false })}>
                          ✗ Неверно{round.minus_on_wrong ? ` −${current.value}` : ""}
                        </button>
                      </div>
                    </>
                  ) : j.buttons === "bar" ? (
                    <div className="row">
                      <span>Полоска идёт…</span>
                      <button className="btn" onClick={() => send({ type: "open_buttons" })}>
                        Открыть кнопки сейчас
                      </button>
                    </div>
                  ) : (
                    <div>
                      Кнопки открыты — ждём нажатия
                      {j.excluded.length > 0 && <span className="muted"> (уже отвечали: {j.excluded.map(name).join(", ")})</span>}
                    </div>
                  )}
                </div>
              )}

              <div className="row">
                {(j.phase === "question" || j.phase === "secret") && (
                  <button className="btn" onClick={() => send({ type: "reveal" })}>
                    Показать ответ
                  </button>
                )}
                <button className={`btn ${j.phase === "answer" ? "primary" : ""}`} onClick={() => send({ type: "to_board" })}>
                  К сетке →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import type { PanelProps } from "./types";

export default function TeamsPanel({ view, send }: PanelProps) {
  const { state } = view;
  const online = new Set(view.online_team_ids);
  const [deltas, setDeltas] = useState<Record<string, string>>({});

  const apply = (teamId: string) => {
    const delta = Number(deltas[teamId]);
    if (!Number.isFinite(delta) || delta === 0) return;
    send({ type: "adjust_score", team_id: teamId, delta });
    setDeltas({ ...deltas, [teamId]: "" });
  };

  return (
    <div className="card console-pane">
      <div className="row" style={{ marginBottom: 6 }}>
        <p className="label" style={{ flex: 1, margin: 0 }}>
          Команды
        </p>
        <button className="btn small" disabled={!view.undo_available} onClick={() => send({ type: "undo" })}>
          ↶ Отменить
        </button>
      </div>

      {state.rejoin_requests.map((r) => (
        <div className="rejoin" key={r.id}>
          <div style={{ marginBottom: 6 }}>«{r.team_name}» хочет войти с нового устройства</div>
          <div className="row">
            <button className="btn small ok" onClick={() => send({ type: "approve_rejoin", request_id: r.id })}>
              Пустить
            </button>
            <button className="btn small" onClick={() => send({ type: "reject_rejoin", request_id: r.id })}>
              Отклонить
            </button>
          </div>
        </div>
      ))}

      {state.teams.length === 0 && <p className="muted">Пока никого</p>}
      {state.teams.map((t) => (
        <div key={t.id}>
          <div className="team-row">
            <span className={`dot ${online.has(t.id) ? "on" : ""}`} title={online.has(t.id) ? "онлайн" : "не на связи"} />
            <span className="name" title={t.name}>
              {t.name}
            </span>
            <b>{t.score}</b>
          </div>
          <div className="row" style={{ padding: "2px 0 8px 14px" }}>
            <input
              className="delta-input"
              type="number"
              placeholder="±"
              value={deltas[t.id] ?? ""}
              onChange={(e) => setDeltas({ ...deltas, [t.id]: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && apply(t.id)}
            />
            <button className="btn small" onClick={() => apply(t.id)}>
              Применить
            </button>
            <button
              className="btn ghost small"
              title="Переименовать"
              onClick={() => {
                const name = window.prompt("Новое название", t.name);
                if (name && name !== t.name) send({ type: "rename_team", team_id: t.id, name });
              }}
            >
              ✎
            </button>
            <button
              className="btn ghost small"
              title="Удалить"
              onClick={() => window.confirm(`Удалить команду «${t.name}»?`) && send({ type: "delete_team", team_id: t.id })}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

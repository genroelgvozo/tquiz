import type { PanelProps } from "./types";

export default function LobbyPanel({ view, send }: PanelProps) {
  return (
    <div className="card console-pane">
      <p className="label">Лобби</p>
      <p>
        Команды входят по QR на общем экране или по ссылке <b>{view.join_url}</b>.
      </p>
      <p className="muted">Подключилось команд: {view.state.teams.length}</p>
      <button className="btn primary" onClick={() => send({ type: "start_game" })}>
        Старт
      </button>
    </div>
  );
}

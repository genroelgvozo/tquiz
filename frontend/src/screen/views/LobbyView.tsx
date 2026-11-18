import { Qr } from "../../components/Qr";
import type { ScreenView } from "../../lib/types";

export default function LobbyView({ view }: { view: ScreenView }) {
  return (
    <div className="scr-lobby">
      {view.qr_visible && <Qr value={view.join_url} size={Math.round(Math.min(window.innerHeight * 0.45, 420))} />}
      <div className="scr-lobby-side">
        <div className="scr-quiz-title">{view.quiz_title}</div>
        {view.qr_visible && (
          <>
            <div className="scr-h2">Сканируйте, чтобы войти</div>
            <div className="scr-muted">{view.join_url.replace(/^https?:\/\//, "")}</div>
          </>
        )}
        <ul className="scr-team-list">
          {view.teams.map((t) => (
            <li key={t.id}>✓ {t.name}</li>
          ))}
          {view.teams.length === 0 && <li className="scr-muted">Ждём команды…</li>}
        </ul>
      </div>
    </div>
  );
}

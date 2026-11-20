import { useCallback, useEffect, useState } from "react";
import { useServerClock } from "../lib/clock";
import { useSocket } from "../lib/socket";
import { DEFAULT_THEME, themeVars } from "../lib/theme";
import type { ServerMessage, TeamView, Theme } from "../lib/types";
import BuzzerView from "./BuzzerView";
import FreeInputView from "./FreeInputView";
import JoinView from "./JoinView";
import "./play.css";
import { loadToken, saveToken } from "./storage";

type Mode = "connecting" | "no_game" | "need_join" | "pending" | "kicked" | "playing";

export default function PlayApp() {
  const [token, setToken] = useState(loadToken);
  const [mode, setMode] = useState<Mode>("connecting");
  const [view, setView] = useState<TeamView | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  const onMessage = useCallback((m: ServerMessage<TeamView>) => {
    switch (m.type) {
      case "state":
        if (m.view) {
          setView(m.view);
          setTheme(m.view.theme);
          setMode("playing");
          setMessage(null);
        }
        break;
      case "no_game":
        setTheme(DEFAULT_THEME);
        setMode("no_game");
        break;
      case "need_join":
        saveToken("");
        setTheme(m.theme ?? DEFAULT_THEME);
        setMode((prev) => (prev === "kicked" ? prev : "need_join"));
        break;
      case "joined":
        saveToken(m.token);
        setToken(m.token);
        setMessage(null);
        break;
      case "pending":
        setMode("pending");
        break;
      case "rejected":
        setMode("need_join");
        setMessage("Ведущий не подтвердил вход");
        break;
      case "kicked":
        saveToken("");
        setToken("");
        setMode("kicked");
        break;
      case "error":
        setMessage(m.message);
        break;
    }
  }, []);

  const path = mode === "kicked" ? null : token ? `/ws/team?token=${encodeURIComponent(token)}` : "/ws/team";
  const { send, status } = useSocket<TeamView>(path, onMessage);
  const now = useServerClock(view?.now);

  // iOS overscroll shows the body behind the page
  useEffect(() => {
    document.body.style.background = theme.bg;
  }, [theme.bg]);

  const header = view && mode === "playing" && (
    <header className="play-header">
      <span className="play-team">{view.team.name}</span>
      {view.score && (
        <span className="play-score">
          {view.score.value}
          {view.score.kind === "round" && <small className="play-score-sub">в туре</small>}
        </span>
      )}
    </header>
  );

  let body: React.ReactNode;
  if (mode === "kicked") {
    body = (
      <Center>
        <div className="play-stack">
          <div className="play-title">Команда вошла с другого устройства</div>
          <button className="play-btn" onClick={() => setMode("connecting")}>
            Войти заново
          </button>
        </div>
      </Center>
    );
  } else if (mode === "no_game") {
    body = <Center>Игра ещё не началась</Center>;
  } else if (mode === "need_join") {
    body = <JoinView message={message} onJoin={(name) => send({ type: "join", name })} />;
  } else if (mode === "pending") {
    body = <Center>Ждём подтверждения ведущего…</Center>;
  } else if (mode === "connecting" || !view) {
    body = <Center>Подключаемся…</Center>;
  } else if (view.stage === "lobby") {
    body = <Center>Ждём начала игры…</Center>;
  } else if (view.stage === "intro" && view.round) {
    body = (
      <Center>
        <div className="play-stack">
          <div className="play-muted">
            Тур {view.round.index + 1} из {view.round.total}
          </div>
          <div className="play-title">{view.round.title}</div>
        </div>
      </Center>
    );
  } else if (view.stage === "jeopardy" && view.jeopardy) {
    body = <BuzzerView j={view.jeopardy} now={now} onBuzz={() => send({ type: "buzz" })} />;
  } else if (view.stage === "free" && view.free) {
    body = (
      <FreeInputView
        free={view.free}
        questionKey={`${view.round?.index}-${view.free.number}`}
        now={now}
        status={status}
        send={send}
      />
    );
  } else if (view.stage === "finished") {
    body = (
      <Center>
        <div className="play-stack">
          <div className="play-title">Игра окончена</div>
          <div className="play-muted">Ваш счёт: {view.score?.value ?? 0}</div>
        </div>
      </Center>
    );
  } else {
    body = <Center>Ждём…</Center>;
  }

  return (
    <div className="hall play" style={themeVars(theme) as React.CSSProperties}>
      {header}
      {status !== "open" && mode !== "kicked" && mode !== "connecting" && (
        <div className="play-offline">Нет связи, переподключаемся…</div>
      )}
      <main className="play-main">{body}</main>
      {message && mode === "playing" && <div className="play-toast">{message}</div>}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="play-center">{children}</div>;
}

import { useCallback, useEffect, useState } from "react";
import { BuzzBar } from "../components/BuzzBar";
import { Logo } from "../components/Logo";
import { PhaseTimerBar } from "../components/PhaseTimerBar";
import { Qr } from "../components/Qr";
import { api } from "../lib/api";
import { useServerClock } from "../lib/clock";
import { useSocket } from "../lib/socket";
import type { ScreenView, ServerMessage } from "../lib/types";
import "./screen.css";
import { useBuzzBeep, useScreenAudio } from "./useScreenAudio";
import BoardView from "./views/BoardView";
import IntroView from "./views/IntroView";
import LeaderboardView from "./views/LeaderboardView";
import LobbyView from "./views/LobbyView";
import QuestionView from "./views/QuestionView";
import WinnerView from "./views/WinnerView";

/** Exchanges ?key=… for a cookie, then strips it from the address bar. */
function useScreenAuth(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("key");
    if (!key) {
      setReady(true);
      return;
    }
    api("POST", "/api/screen/auth", { key })
      .catch(() => {})
      .finally(() => {
        window.history.replaceState(null, "", window.location.pathname);
        setReady(true);
      });
  }, []);
  return ready;
}

export default function ScreenApp() {
  const ready = useScreenAuth();
  const [view, setView] = useState<ScreenView | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [beepCtx, setBeepCtx] = useState<AudioContext | null>(null);

  const onMessage = useCallback((m: ServerMessage<ScreenView>) => {
    if (m.type === "state") setView(m.view);
  }, []);
  const { status } = useSocket<ScreenView>(ready ? "/ws/screen" : null, onMessage);
  const now = useServerClock(view?.now);
  const unlockAudio = useScreenAudio(view, unlocked);
  useBuzzBeep(view?.jeopardy?.answering_team_id, beepCtx);

  const enter = () => {
    unlockAudio();
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      void ctx.resume();
      setBeepCtx(ctx);
    } catch {
      /* no WebAudio: no beep */
    }
    void document.documentElement.requestFullscreen?.().catch(() => {});
    setUnlocked(true);
  };

  if (status === "unauthorized") {
    return <div className="dark scr-root center-message">Откройте экран по ссылке из админки</div>;
  }

  let content: React.ReactNode = <div className="scr-center scr-h1">{view?.quiz_title ?? "TQuiz"}</div>;
  if (view) {
    if (view.stage === "lobby") content = <LobbyView view={view} />;
    else if (view.stage === "intro" && view.round) content = <IntroView round={view.round} />;
    else if (view.stage === "finished") content = <WinnerView teams={view.teams} />;
    else if (view.stage === "jeopardy" && view.jeopardy) {
      const j = view.jeopardy;
      const answering = view.teams.find((t) => t.id === j.answering_team_id);
      if (j.phase === "board" || !j.question) content = <BoardView j={j} teams={view.teams} />;
      else if (j.phase === "secret")
        content = (
          <div className="scr-center">
            <div className="scr-tag-inline scr-muted">{j.question.title}</div>
            <div className="scr-h1 scr-accent">Секрет!</div>
          </div>
        );
      else
        content = (
          <QuestionView
            q={j.question}
            dimText={j.phase === "answer"}
            footer={
              <>
                {j.phase === "question" && j.buttons === "bar" && j.bar_ends_at !== null && (
                  <BuzzBar endsAt={j.bar_ends_at} seconds={j.bar_seconds} now={now} />
                )}
                {answering && j.phase === "question" && <div className="scr-who">Отвечает: {answering.name}</div>}
              </>
            }
          />
        );
    } else if (view.stage === "free" && view.free) {
      const f = view.free;
      content =
        f.phase === "review" ? (
          <QuestionView q={f.question} tag={`Разбор · Вопрос ${f.number}`} />
        ) : (
          <QuestionView q={f.question} footer={<PhaseTimerBar timer={f.timer} now={now} />} />
        );
    }
  }

  return (
    <div className="dark scr-root">
      <div className="scr-logo">
        <Logo url={view?.logo_url ?? null} />
      </div>
      {content}
      {view?.overlay === "leaderboard" && (
        <div className="scr-overlay">
          <LeaderboardView teams={view.teams} />
        </div>
      )}
      {view && view.qr_visible && view.stage !== "lobby" && (
        <div className="scr-mini-qr">
          <Qr value={view.join_url} size={110} />
        </div>
      )}
      {status !== "open" && <div className="scr-offline">нет связи…</div>}
      {unlocked ? (
        <button
          className="scr-fs-btn"
          title="На весь экран"
          onClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}
        >
          ⛶
        </button>
      ) : (
        <div className="scr-gate">
          <button className="scr-gate-btn" onClick={enter}>
            Включить звук и на весь экран
          </button>
        </div>
      )}
    </div>
  );
}

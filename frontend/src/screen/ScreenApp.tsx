import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BuzzBar } from "../components/BuzzBar";
import { Logo } from "../components/Logo";
import { PhaseTimerBar } from "../components/PhaseTimerBar";
import { Qr } from "../components/Qr";
import { api } from "../lib/api";
import { useServerClock } from "../lib/clock";
import { DEFAULT_THEME, themeVars } from "../lib/theme";
import { useSocket } from "../lib/socket";
import type { ScreenView, ServerMessage } from "../lib/types";
import { sceneOf } from "./scene";
import { SceneStage } from "./SceneStage";
import "./screen.css";
import type { SceneSequence } from "./useSceneSequence";
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

/** The content of the shown scene, drawn from the latest snapshot (during the cell blink the board is still shown). */
function sceneContent({ shown }: SceneSequence, view: ScreenView | null, now: () => number): ReactNode {
  const j = view?.jeopardy;
  const f = view?.free;
  if (view) {
    switch (shown.kind) {
      case "lobby":
        return <LobbyView view={view} />;
      case "intro":
        if (view.round) return <IntroView round={view.round} />;
        break;
      case "winner":
        return <WinnerView standings={view.standings} />;
      case "board":
        if (j) return <BoardView j={j} teams={view.teams} />;
        break;
      case "secret":
        if (j?.question)
          return (
            <div className="scr-center">
              <div className="scr-tag-inline scr-muted">{j.question.title}</div>
              <div className="scr-h1 scr-accent">Секрет!</div>
            </div>
          );
        break;
      case "jq":
        if (j?.question) {
          const answering = view.teams.find((t) => t.id === j.answering_team_id);
          return (
            <QuestionView
              q={j.question}
              head={{ main: j.question.title }}
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
        }
        break;
      case "free":
        if (f)
          return (
            <QuestionView
              q={f.question}
              head={{ main: `Вопрос ${f.number}`, tail: ` из ${f.total}` }}
              footer={<PhaseTimerBar timer={f.timer} now={now} />}
            />
          );
        break;
      case "review":
        if (f)
          return (
            <QuestionView q={f.question} head={{ main: "Правильные ответы", tail: ` · вопрос ${f.number} из ${f.total}` }} />
          );
        break;
    }
  }
  return <div className="scr-center scr-h1">{view?.quiz_title ?? "TQuiz"}</div>;
}

export default function ScreenApp() {
  const ready = useScreenAuth();
  const [view, setView] = useState<ScreenView | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [beepCtx, setBeepCtx] = useState<AudioContext | null>(null);
  // The first snapshot after loading or reconnecting remounts the stage, so it is drawn at once, without animation.
  const [stageEpoch, setStageEpoch] = useState(0);
  const awaitingFirst = useRef(true);

  const onMessage = useCallback((m: ServerMessage<ScreenView>) => {
    if (m.type !== "state") return;
    if (awaitingFirst.current) {
      awaitingFirst.current = false;
      setStageEpoch((e) => e + 1);
    }
    setView(m.view);
  }, []);
  const { status } = useSocket<ScreenView>(ready ? "/ws/screen" : null, onMessage);
  useEffect(() => {
    if (status !== "open") awaitingFirst.current = true;
  }, [status]);
  const now = useServerClock(view?.now);
  const style = themeVars(view?.theme ?? DEFAULT_THEME) as React.CSSProperties;
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
    return <div className="hall scr-root center-message" style={style}>Откройте экран по ссылке из админки</div>;
  }

  return (
    <div className={`hall scr-root${view?.logo_url ? " scr-with-logo" : ""}`} style={style}>
      <SceneStage key={stageEpoch} scene={sceneOf(view)}>
        {(seq) => sceneContent(seq, view, now)}
      </SceneStage>
      <div className="scr-logo">
        <Logo url={view?.logo_url ?? null} />
      </div>
      {view?.overlay === "leaderboard" && (
        <div className="scr-overlay">
          <LeaderboardView standings={view.standings} />
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

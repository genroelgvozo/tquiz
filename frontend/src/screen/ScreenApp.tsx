import { AnimatePresence, motion } from "motion/react";
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
import { Backdrop } from "./Backdrop";
import { variants } from "./motion";
import { stageScene, type Scene } from "./scene";
import { SceneStage } from "./SceneStage";
import "./screen.css";
import { SoundControls } from "./SoundControls";
import { useBackgroundMusic } from "./useBackgroundMusic";
import type { SceneSequence } from "./useSceneSequence";
import { useBuzzBeep, useScreenAudio } from "./useScreenAudio";
import BoardView, { CellExpand } from "./views/BoardView";
import IntroView from "./views/IntroView";
import LeaderboardView from "./views/LeaderboardView";
import LobbyView from "./views/LobbyView";
import QuestionView from "./views/QuestionView";
import ReviewView from "./views/ReviewView";
import { HEAD_LAYOUT_ID } from "./views/SceneHeader";
import { TitleIntro } from "./views/TitleIntro";
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
function sceneContent(seq: SceneSequence, view: ScreenView | null, now: () => number): ReactNode {
  const { shown, entrance, blinkId } = seq;
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
        if (j) return <BoardView j={j} teams={view.teams} blinkId={blinkId} />;
        break;
      case "secret":
        if (j?.question)
          return (
            <div className="scr-center">
              <div className="scr-tag-inline scr-muted">{j.question.title}</div>
              <motion.div className="scr-h1 scr-accent" variants={variants.secret}>
                Секрет!
              </motion.div>
            </div>
          );
        break;
      case "jq":
        if (j?.question) {
          const answering = j.phase === "question" ? view.teams.find((t) => t.id === j.answering_team_id) : undefined;
          return (
            <>
              <TitleIntro title={j.question.title} layoutId={HEAD_LAYOUT_ID} play={entrance === "title"}>
                <QuestionView
                  q={j.question}
                  head={{ main: j.question.title, layoutId: HEAD_LAYOUT_ID }}
                  entrance={entrance}
                  typing={j.typing}
                  now={now}
                  dimText={j.phase === "answer"}
                  footer={
                    <>
                      {j.phase === "question" && j.buttons === "bar" && j.bar_ends_at !== null && (
                        <BuzzBar endsAt={j.bar_ends_at} seconds={j.bar_seconds} now={now} />
                      )}
                      {/* popLayout: the leaving plate does not push the next team's one aside */}
                      <AnimatePresence initial={false} mode="popLayout">
                        {answering && (
                          <motion.div
                            key={answering.id}
                            className="scr-who"
                            variants={variants.who}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                          >
                            Отвечает: {answering.name}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  }
                />
              </TitleIntro>
              {entrance === "zoom" && <CellExpand questionId={shown.questionId} />}
            </>
          );
        }
        break;
      case "free":
        if (f)
          return (
            <TitleIntro title={`Вопрос ${f.number}`} layoutId={HEAD_LAYOUT_ID} play={entrance === "title"}>
              <QuestionView
                q={f.question}
                head={{ main: `Вопрос ${f.number}`, tail: ` из ${f.total}`, layoutId: HEAD_LAYOUT_ID }}
                entrance={entrance}
                footer={<PhaseTimerBar timer={f.timer} now={now} />}
              />
            </TitleIntro>
          );
        break;
      case "review":
        if (f) return <ReviewView free={f} play={entrance === "title"} />;
        break;
    }
  }
  return <div className="scr-center scr-h1">{view?.quiz_title ?? "TQuiz"}</div>;
}

/** How long an unlock may take: a refused `AudioContext.resume()` may never settle. */
const UNLOCK_TIMEOUT_MS = 2000;

/** True when every check resolves to true; false as soon as one fails, rejects, or time runs out. */
function allConfirmed(checks: Promise<boolean>[], ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    let left = checks.length;
    const timer = window.setTimeout(() => resolve(false), ms);
    const done = (ok: boolean) => {
      left -= 1;
      if (ok && left > 0) return;
      window.clearTimeout(timer);
      resolve(ok);
    };
    for (const check of checks) check.then(done, () => done(false));
  });
}

/** WebAudio for the buzz beep; null without WebAudio. */
function newAudioContext(): AudioContext | null {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    return new Ctx();
  } catch {
    return null;
  }
}

export default function ScreenApp() {
  const ready = useScreenAuth();
  const [view, setView] = useState<ScreenView | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const soundOn = useRef(false); // `unlocked` without waiting for a render
  const unlocking = useRef(false); // an unlock is in progress (the icon's click also reaches the window listener)
  const [beepCtx, setBeepCtx] = useState<AudioContext | null>(null);
  // The first snapshot after loading or reconnecting remounts the stage, so it is drawn at once, without animation.
  const [stageEpoch, setStageEpoch] = useState(0);
  const awaitingFirst = useRef(true);
  // Under the standings overlay the stage keeps the scene, and the snapshot it is drawn from, that was showing when the
  // overlay opened: a scene that changed under it (the next round's intro) plays its entrance once the overlay clears.
  const stage = useRef<{ scene: Scene; view: ScreenView | null } | null>(null);

  const onMessage = useCallback((m: ServerMessage<ScreenView>) => {
    if (m.type !== "state") return;
    if (awaitingFirst.current) {
      awaitingFirst.current = false;
      stage.current = null; // the first snapshot is drawn with its own scene, even under the overlay
      setStageEpoch((e) => e + 1);
    }
    setView(m.view);
  }, []);
  const { send, status } = useSocket<ScreenView>(ready ? "/ws/screen" : null, onMessage);
  useEffect(() => {
    if (status !== "open") awaitingFirst.current = true;
  }, [status]);
  const now = useServerClock(view?.now);
  const scene = stageScene(stage.current?.scene ?? null, view);
  if (scene !== stage.current?.scene) stage.current = { scene, view };
  const stageView = stage.current.view;
  const style = themeVars(view?.theme ?? DEFAULT_THEME) as React.CSSProperties;
  const setSound = useCallback((on: boolean) => {
    soundOn.current = on;
    setUnlocked(on);
  }, []);
  // safety net: a player was refused after all, so the sound is off again and the console warns the host
  const soundBlocked = useCallback(() => setSound(false), [setSound]);
  const unlockQuestionAudio = useScreenAudio(view, unlocked, soundBlocked);
  const unlockMusic = useBackgroundMusic(view?.music ?? null, unlocked, soundBlocked);
  // a suspended context would play a queued beep on unlocking, so no beeps until then
  useBuzzBeep(view?.jeopardy?.answering_team_id, unlocked ? beepCtx : null);

  // The beep's context is made at once: if it is already running, the browser lets this page make sound without a click.
  useEffect(() => {
    const ctx = newAudioContext();
    if (!ctx) return;
    setBeepCtx(ctx);
    const onState = () => {
      // during an unlock the unlock itself decides
      if (ctx.state === "running" && !unlocking.current) setSound(true);
    };
    ctx.addEventListener("statechange", onState);
    onState();
    return () => {
      ctx.removeEventListener("statechange", onState);
      void ctx.close().catch(() => {});
    };
  }, [setSound]);

  /**
   * Unlocks both players and the beep; must run inside the user's click.
   * The sound counts as on only when the browser accepted all three; otherwise it stays off and the next click tries again.
   */
  const enableSound = useCallback(() => {
    if (soundOn.current || unlocking.current) return;
    unlocking.current = true;
    const ctxRunning = beepCtx ? beepCtx.resume().then(() => beepCtx.state === "running") : Promise.resolve(true);
    void allConfirmed([unlockQuestionAudio(), unlockMusic(), ctxRunning], UNLOCK_TIMEOUT_MS).then((ok) => {
      unlocking.current = false;
      if (ok) setSound(true);
    });
  }, [beepCtx, unlockQuestionAudio, unlockMusic, setSound]);

  // A click anywhere on the screen (or a key, e.g. OK on a TV remote) turns the sound on.
  // Not pointerdown: a touch pointerdown doesn't count as a user gesture, only the tap's click does.
  useEffect(() => {
    if (unlocked) return;
    window.addEventListener("click", enableSound);
    window.addEventListener("keydown", enableSound);
    return () => {
      window.removeEventListener("click", enableSound);
      window.removeEventListener("keydown", enableSound);
    };
  }, [unlocked, enableSound]);

  // the console warns the host while no screen has its sound on
  useEffect(() => {
    if (status === "open") send({ type: "sound", on: unlocked });
  }, [status, unlocked, send]);

  if (status === "unauthorized") {
    return <div className="hall scr-root center-message" style={style}>Откройте экран по ссылке из админки</div>;
  }

  return (
    <div className={`hall scr-root${view?.logo_url ? " scr-with-logo" : ""}`} style={style}>
      {/* mounted with the first snapshot, so the first picture is drawn at once */}
      {view && <Backdrop url={view.background_url} />}
      <SceneStage key={stageEpoch} scene={scene}>
        {(seq) => sceneContent(seq, stageView, now)}
      </SceneStage>
      <div className="scr-logo">
        <Logo url={view?.logo_url ?? null} />
      </div>
      {/* keyed by the epoch: an overlay already open at the first snapshot is drawn at once */}
      <AnimatePresence key={`overlay-${stageEpoch}`} initial={false}>
        {view?.overlay === "leaderboard" && (
          <motion.div
            key="leaderboard"
            className="scr-overlay"
            variants={variants.fade}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <Backdrop url={view.quiz_background_url} />
            <LeaderboardView standings={view.standings} />
          </motion.div>
        )}
      </AnimatePresence>
      {view && view.qr_visible && view.stage !== "lobby" && (
        <div className="scr-mini-qr">
          <Qr value={view.join_url} size={110} />
        </div>
      )}
      {status !== "open" && <div className="scr-offline">нет связи…</div>}
      <SoundControls soundOn={unlocked} onSound={enableSound} />
    </div>
  );
}

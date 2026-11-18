import { Button, Modal, Stack, Text } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Qr } from "../../components/Qr";
import { api, ApiError } from "../../lib/api";
import { useSocket } from "../../lib/socket";
import type { AdminCommand, AdminView, ServerMessage } from "../../lib/types";
import { confirmDialog } from "../dialogs";
import { ROUND_KINDS } from "../roundKinds";
import { useToast } from "../useToast";
import "./console.css";
import FreePanel from "./FreePanel";
import JeopardyPanel from "./JeopardyPanel";
import LobbyPanel from "./LobbyPanel";
import ReviewPanel from "./ReviewPanel";
import TeamsPanel from "./TeamsPanel";

const STAGE_TITLES = { lobby: "Лобби", intro: "Заставка тура", jeopardy: "Своя игра", free: "Свободный ввод", finished: "Игра окончена" };

export default function Console() {
  const [view, setView] = useState<AdminView | null | undefined>(undefined);
  const [screenUrl, setScreenUrl] = useState<string | null>(null);
  const [showScreenQr, setShowScreenQr] = useState(false);
  const { toast, show } = useToast();

  const onMessage = useCallback(
    (m: ServerMessage<AdminView>) => {
      if (m.type === "state") setView(m.view);
      else if (m.type === "error") show(m.message);
    },
    [show],
  );
  const { send: rawSend, status } = useSocket<AdminView>("/ws/admin", onMessage);
  const send = useCallback(
    (cmd: AdminCommand) => {
      if (!rawSend(cmd)) show("Нет связи с сервером — команда не отправлена");
    },
    [rawSend, show],
  );

  useEffect(() => {
    api<{ url: string }>("GET", "/api/game/screen-link")
      .then((r) => setScreenUrl(r.url))
      .catch(() => {});
  }, []);

  const closeGame = async () => {
    const ok = await confirmDialog({
      title: "Закрыть игру?",
      message: "Экран и телефоны вернутся в ожидание.",
      confirmLabel: "Закрыть игру",
      danger: true,
    });
    if (!ok) return;
    try {
      await api("POST", "/api/game/stop");
    } catch (e) {
      show(e instanceof ApiError ? e.detail : "Ошибка");
    }
  };

  if (status === "unauthorized") return <main className="admin-main">Требуется вход</main>;
  if (view === undefined) return <main className="admin-main muted">Подключаемся…</main>;
  if (view === null)
    return (
      <main className="admin-main">
        <div className="card console-pane">
          <p>Нет активной игры.</p>
          <Link to="/admin">Выберите квиз и нажмите «Начать игру»</Link>
        </div>
        {toast}
      </main>
    );

  const st = view.state;
  const round = st.round_index >= 0 ? view.quiz.rounds[st.round_index] : undefined;
  const hasNextRound = st.round_index + 1 < view.quiz.rounds.length;
  const inGame = st.stage === "intro" || st.stage === "jeopardy" || st.stage === "free";

  let panel: React.ReactNode = null;
  if (st.stage === "lobby") panel = <LobbyPanel view={view} send={send} />;
  else if (st.stage === "intro" && round)
    panel = (
      <div className="card console-pane">
        <p className="label">
          Тур {st.round_index + 1} из {view.quiz.rounds.length} · {ROUND_KINDS[round.kind].title}
        </p>
        <h3 style={{ marginTop: 0 }}>{round.title}</h3>
        <p className="muted">На экране заставка тура.</p>
        <button className="btn primary" onClick={() => send({ type: "start_round" })}>
          Начать тур
        </button>
      </div>
    );
  else if (st.stage === "jeopardy") panel = <JeopardyPanel view={view} send={send} />;
  else if (st.stage === "free" && st.free?.phase === "review") panel = <ReviewPanel view={view} send={send} />;
  else if (st.stage === "free") panel = <FreePanel view={view} send={send} />;
  else if (st.stage === "finished") {
    const winner = [...st.teams].sort((a, b) => b.score - a.score)[0];
    panel = (
      <div className="card console-pane">
        <p className="label">Игра окончена</p>
        {winner && (
          <h3 style={{ marginTop: 0 }}>
            Победитель: {winner.name} ({winner.score})
          </h3>
        )}
        <button className="btn primary" onClick={closeGame}>
          Закрыть игру
        </button>
      </div>
    );
  }

  return (
    <main className="admin-main">
      <div className="console-head">
        <h2>
          Пульт · {view.quiz.title}
          {round ? ` · Тур ${st.round_index + 1}` : ""} · {STAGE_TITLES[st.stage]}
        </h2>
        {status !== "open" && <span className="chip yellow">нет связи…</span>}
        {screenUrl && (
          <>
            <button className="btn" onClick={() => window.open(screenUrl, "tquiz-screen")}>
              Открыть экран
            </button>
            <button className="btn" onClick={() => setShowScreenQr(true)}>
              QR экрана
            </button>
          </>
        )}
        <button className="btn" onClick={() => send({ type: "show_qr", visible: !st.qr_visible })}>
          QR входа: {st.qr_visible ? "скрыть" : "показать"}
        </button>
        <button
          className={`btn ${st.overlay === "leaderboard" ? "primary" : ""}`}
          onClick={() => send({ type: "set_overlay", overlay: st.overlay === "leaderboard" ? null : "leaderboard" })}
        >
          {st.overlay === "leaderboard" ? "Убрать рейтинг" : "Рейтинг на экран"}
        </button>
        {inGame && hasNextRound && (
          <button
            className="btn"
            onClick={async () => {
              const unfinished =
                (st.stage === "free" && st.free?.phase === "question") ||
                (st.stage === "jeopardy" && round !== undefined && st.jeopardy !== null &&
                  st.jeopardy.played.length < round.categories.reduce((n, c) => n + c.questions.length, 0));
              const ok =
                st.stage === "intro" ||
                (await confirmDialog(
                  unfinished
                    ? {
                        title: "Тур не закончен",
                        message: "Есть неразобранные ответы или несыгранные вопросы. Перейти к следующему туру? Вернуться будет нельзя.",
                        confirmLabel: "Перейти",
                        danger: true,
                      }
                    : { title: "Перейти к следующему туру?", confirmLabel: "Перейти" },
                ));
              if (ok) send({ type: "next_round" });
            }}
          >
            След. тур →
          </button>
        )}
        {st.stage !== "finished" && st.stage !== "lobby" && (
          <button
            className="btn"
            onClick={async () => {
              const ok = await confirmDialog({ title: "Завершить игру и показать победителя?", confirmLabel: "Завершить" });
              if (ok) send({ type: "finish_game" });
            }}
          >
            Завершить игру
          </button>
        )}
        {st.stage === "lobby" && (
          <button className="btn" onClick={closeGame}>
            Закрыть игру
          </button>
        )}
      </div>

      <div className="console-body">
        <div>{panel}</div>
        <TeamsPanel view={view} send={send} />
      </div>

      <Modal opened={showScreenQr && !!screenUrl} onClose={() => setShowScreenQr(false)} title="Откройте ссылку на ТВ или проекторе">
        {screenUrl && (
          <Stack align="center">
            <Qr value={screenUrl} size={260} />
            <Text size="sm" style={{ wordBreak: "break-all" }} ta="center">
              {screenUrl}
            </Text>
            <Button variant="default" onClick={() => setShowScreenQr(false)}>
              Закрыть
            </Button>
          </Stack>
        )}
      </Modal>
      {toast}
    </main>
  );
}

import { Anchor, Badge, Button, Grid, Group, Modal, Paper, Stack, Text, Title } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Qr } from "../../components/Qr";
import { api } from "../../lib/api";
import { useSocket } from "../../lib/socket";
import type { AdminCommand, AdminView, ServerMessage } from "../../lib/types";
import { confirmDialog } from "../dialogs";
import { notifyApiError, notifyError } from "../notify";
import { ROUND_KINDS } from "../roundKinds";
import { SectionLabel } from "../ui";
import { uncheckedCount } from "./check";
import CheckTable from "./CheckTable";
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

  const onMessage = useCallback((m: ServerMessage<AdminView>) => {
    if (m.type === "state") setView(m.view);
    else if (m.type === "error") notifyError(m.message);
  }, []);
  const { send: rawSend, status } = useSocket<AdminView>("/ws/admin", onMessage);
  const send = useCallback(
    (cmd: AdminCommand) => {
      if (!rawSend(cmd)) notifyError("Нет связи с сервером — команда не отправлена");
    },
    [rawSend],
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
      notifyApiError(e, "Ошибка");
    }
  };

  if (status === "unauthorized") return <Text>Требуется вход</Text>;
  if (view === undefined) return <Text c="dimmed">Подключаемся…</Text>;
  if (view === null)
    return (
      <Paper withBorder p="md">
        <Stack gap="xs">
          <Text>Нет активной игры.</Text>
          <Anchor component={Link} to="/admin" size="sm">
            Выберите квиз и нажмите «Начать игру»
          </Anchor>
        </Stack>
      </Paper>
    );

  const st = view.state;
  const round = st.round_index >= 0 ? view.quiz.rounds[st.round_index] : undefined;
  const hasNextRound = st.round_index + 1 < view.quiz.rounds.length;
  const inGame = st.stage === "intro" || st.stage === "jeopardy" || st.stage === "free";

  let panel: React.ReactNode = null;
  if (st.stage === "lobby") panel = <LobbyPanel view={view} send={send} />;
  else if (st.stage === "intro" && round)
    panel = (
      <Paper withBorder p="md">
        <SectionLabel>
          Тур {st.round_index + 1} из {view.quiz.rounds.length} · {ROUND_KINDS[round.kind].title}
        </SectionLabel>
        <Stack align="flex-start">
          <Title order={3}>{round.title}</Title>
          <Text c="dimmed">{st.overlay === "leaderboard" ? "На экране сводная таблица." : "На экране заставка тура."}</Text>
          <Group>
            <Button onClick={() => send({ type: "start_round" })}>Начать тур</Button>
            {st.overlay === "leaderboard" && (
              <Button variant="default" onClick={() => send({ type: "set_overlay", overlay: null })}>
                Показать заставку тура
              </Button>
            )}
          </Group>
        </Stack>
      </Paper>
    );
  else if (st.stage === "jeopardy") panel = <JeopardyPanel view={view} send={send} />;
  else if (st.stage === "free")
    panel = (
      <Stack>
        {st.free?.phase === "review" ? <ReviewPanel view={view} send={send} /> : <FreePanel view={view} send={send} />}
        <CheckTable view={view} send={send} />
      </Stack>
    );
  else if (st.stage === "finished") {
    const winner = st.standings.rows[0];
    panel = (
      <Paper withBorder p="md">
        <SectionLabel>Игра окончена</SectionLabel>
        <Stack align="flex-start">
          {winner && (
            <Title order={3}>
              Победитель: {winner.name} ({winner.total})
            </Title>
          )}
          <Button onClick={closeGame}>Закрыть игру</Button>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack>
      <Group gap="xs">
        <Title order={4} flex={1} miw={200}>
          Пульт · {view.quiz.title}
          {round ? ` · Тур ${st.round_index + 1}` : ""} · {STAGE_TITLES[st.stage]}
        </Title>
        {status !== "open" && <Badge color="yellow">нет связи…</Badge>}
        {screenUrl && (
          <>
            <Button variant="default" onClick={() => window.open(screenUrl, "tquiz-screen")}>
              Открыть экран
            </Button>
            <Button variant="default" onClick={() => setShowScreenQr(true)}>
              QR экрана
            </Button>
          </>
        )}
        <Button variant="default" onClick={() => send({ type: "show_qr", visible: !st.qr_visible })}>
          QR входа: {st.qr_visible ? "скрыть" : "показать"}
        </Button>
        <Button
          variant={st.overlay === "leaderboard" ? "filled" : "default"}
          onClick={() => send({ type: "set_overlay", overlay: st.overlay === "leaderboard" ? null : "leaderboard" })}
        >
          {st.overlay === "leaderboard" ? "Убрать рейтинг" : "Рейтинг на экран"}
        </Button>
        {inGame && hasNextRound && (
          <Button
            variant="default"
            onClick={async () => {
              const unchecked = st.stage === "free" ? uncheckedCount(view) : 0;
              const unfinished =
                (st.stage === "free" && (st.free?.phase === "question" || unchecked > 0)) ||
                (st.stage === "jeopardy" && round !== undefined && st.jeopardy !== null &&
                  st.jeopardy.played.length < round.categories.reduce((n, c) => n + c.questions.length, 0));
              const ok =
                st.stage === "intro" ||
                (await confirmDialog(
                  unfinished
                    ? {
                        title: "Тур не закончен",
                        message:
                          "Есть неразобранные ответы или несыгранные вопросы." +
                          (unchecked > 0 ? ` Не проверено ответов: ${unchecked}.` : "") +
                          " Перейти к следующему туру? Вернуться будет нельзя.",
                        confirmLabel: "Перейти",
                        danger: true,
                      }
                    : { title: "Перейти к следующему туру?", confirmLabel: "Перейти" },
                ));
              if (ok) send({ type: "next_round" });
            }}
          >
            След. тур →
          </Button>
        )}
        {st.stage !== "finished" && st.stage !== "lobby" && (
          <Button
            variant="default"
            onClick={async () => {
              const ok = await confirmDialog({ title: "Завершить игру и показать победителя?", confirmLabel: "Завершить" });
              if (ok) send({ type: "finish_game" });
            }}
          >
            Завершить игру
          </Button>
        )}
        {st.stage === "lobby" && (
          <Button variant="default" onClick={closeGame}>
            Закрыть игру
          </Button>
        )}
      </Group>

      <Grid align="flex-start">
        <Grid.Col span={{ base: 12, md: 8, lg: 9 }}>{panel}</Grid.Col>
        <Grid.Col span={{ base: 12, md: 4, lg: 3 }}>
          <TeamsPanel view={view} send={send} />
        </Grid.Col>
      </Grid>

      <Modal opened={showScreenQr && !!screenUrl} onClose={() => setShowScreenQr(false)} title="Откройте ссылку на ТВ или проекторе">
        {screenUrl && (
          <Stack align="center">
            <Qr value={screenUrl} size={260} />
            <Text style={{ wordBreak: "break-all" }} ta="center">
              {screenUrl}
            </Text>
            <Button variant="default" onClick={() => setShowScreenQr(false)}>
              Закрыть
            </Button>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

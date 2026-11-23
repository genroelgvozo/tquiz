import { Anchor, Box, Button, Grid, Paper, Stack, Text, Title } from "@mantine/core";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { leadersAndRanks } from "../../lib/standings";
import { useSocket } from "../../lib/socket";
import type { AdminCommand, AdminView, ServerMessage } from "../../lib/types";
import { notifyApiError, notifyError } from "../notify";
import { ROUND_KINDS } from "../roundKinds";
import { SectionLabel } from "../ui";
import CheckTable from "./CheckTable";
import "./console.css";
import FlowBar from "./FlowBar";
import FreePanel from "./FreePanel";
import JeopardyPanel from "./JeopardyPanel";
import LobbyPanel from "./LobbyPanel";
import ReviewPanel from "./ReviewPanel";
import ScreenBar from "./ScreenBar";
import TeamsPanel from "./TeamsPanel";

export default function Console() {
  const [view, setView] = useState<AdminView | null | undefined>(undefined);

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

  // the confirmation is asked by FlowBar (stepConfirm "close_game")
  const closeGame = async () => {
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

  let panel: React.ReactNode = null;
  if (st.stage === "lobby") panel = <LobbyPanel view={view} />;
  else if (st.stage === "intro" && round)
    panel = (
      <Paper withBorder p="md">
        <SectionLabel>
          Тур {st.round_index + 1} из {view.quiz.rounds.length} · {ROUND_KINDS[round.kind].title}
        </SectionLabel>
        <Stack align="flex-start">
          <Title order={3}>{round.title}</Title>
          <Text c="dimmed">{st.overlay === "leaderboard" ? "На экране сводная таблица." : "На экране заставка тура."}</Text>
          {st.overlay === "leaderboard" && (
            <Button variant="default" onClick={() => send({ type: "set_overlay", overlay: null })}>
              Показать заставку тура
            </Button>
          )}
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
    const { leaders } = leadersAndRanks(st.standings);
    const winners = st.standings.rows.filter((r) => leaders.includes(r.team_id));
    panel = (
      <Paper withBorder p="md">
        <SectionLabel>Игра окончена</SectionLabel>
        <Stack align="flex-start">
          {winners.length > 0 && (
            <Title order={3}>
              {winners.length === 1 ? "Победитель" : "Победители"}: {winners.map((w) => w.name).join(", ")} ({winners[0].total})
            </Title>
          )}
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack>
      <Box pos="sticky" top={52} bg="gray.0" style={{ zIndex: 10 }}>
        <Stack gap="xs" py="xs">
          <ScreenBar view={view} send={send} />
          <FlowBar view={view} send={send} status={status} onCloseGame={closeGame} />
        </Stack>
      </Box>

      <Grid align="flex-start">
        <Grid.Col span={{ base: 12, md: 8, lg: 9 }}>{panel}</Grid.Col>
        <Grid.Col span={{ base: 12, md: 4, lg: 3 }}>
          <TeamsPanel view={view} send={send} />
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

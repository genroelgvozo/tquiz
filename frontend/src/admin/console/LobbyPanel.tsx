import { Button, Paper, Stack, Text } from "@mantine/core";
import { SectionLabel } from "../ui";
import type { PanelProps } from "./types";

export default function LobbyPanel({ view, send }: PanelProps) {
  return (
    <Paper withBorder p="md">
      <SectionLabel>Лобби</SectionLabel>
      <Stack align="flex-start">
        <Text>
          Команды входят по QR на общем экране или по ссылке <b>{view.join_url}</b>.
        </Text>
        <Text c="dimmed">Подключилось команд: {view.state.teams.length}</Text>
        <Button onClick={() => send({ type: "start_game" })}>Старт</Button>
      </Stack>
    </Paper>
  );
}

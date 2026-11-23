import { ActionIcon, Alert, Box, Button, Divider, Group, NumberInput, Paper, Stack, Text } from "@mantine/core";
import { Fragment, useState } from "react";
import { confirmDialog, promptDialog } from "../dialogs";
import { SectionLabel } from "../ui";
import type { PanelProps } from "./types";

export default function TeamsPanel({ view, send }: PanelProps) {
  const { state } = view;
  const online = new Set(view.online_team_ids);
  const [deltas, setDeltas] = useState<Record<string, string | number>>({});

  const apply = (teamId: string) => {
    const delta = Number(deltas[teamId]);
    if (!Number.isFinite(delta) || delta === 0) return;
    send({ type: "adjust_score", team_id: teamId, delta });
    setDeltas({ ...deltas, [teamId]: "" });
  };

  return (
    <Paper withBorder p="md">
      <SectionLabel>Команды</SectionLabel>

      <Stack gap="xs">
        {state.rejoin_requests.map((r) => (
          <Alert key={r.id} color="yellow" variant="light" p="xs">
            <Text mb="xs">«{r.team_name}» хочет войти с нового устройства</Text>
            <Group gap="xs">
              <Button size="xs" color="green" onClick={() => send({ type: "approve_rejoin", request_id: r.id })}>
                Пустить
              </Button>
              <Button size="xs" variant="default" onClick={() => send({ type: "reject_rejoin", request_id: r.id })}>
                Отклонить
              </Button>
            </Group>
          </Alert>
        ))}

        {state.teams.length === 0 && <Text c="dimmed">Пока никого</Text>}
        {state.teams.map((t, i) => (
          <Fragment key={t.id}>
            {i > 0 && <Divider />}
            <Box>
              <Group gap="xs" wrap="nowrap">
                <Box
                  w={8}
                  h={8}
                  bdrs="xl"
                  bg={online.has(t.id) ? "green.6" : "gray.4"}
                  style={{ flex: "none" }}
                  title={online.has(t.id) ? "онлайн" : "не на связи"}
                />
                <Text flex={1} truncate title={t.name}>
                  {t.name}
                </Text>
                <Text size="sm" c="dimmed">
                  {t.round_score !== null && <>в туре {state.round_index + 1}: {t.round_score} · </>}
                  итог <Text span fw={700} c="dark">{t.total}</Text>
                </Text>
              </Group>
              <Group gap={6} wrap="nowrap" mt={6} pl="md">
                <NumberInput
                  size="xs"
                  w={64}
                  hideControls
                  disabled={state.score_adjust_round === null}
                  placeholder="±"
                  value={deltas[t.id] ?? ""}
                  onChange={(v) => setDeltas({ ...deltas, [t.id]: v })}
                  onKeyDown={(e) => e.key === "Enter" && apply(t.id)}
                />
                <Button size="xs" variant="default" disabled={state.score_adjust_round === null} onClick={() => apply(t.id)}>
                  Применить
                </Button>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="input-xs"
                  title="Переименовать"
                  onClick={async () => {
                    const name = await promptDialog({ title: "Переименовать команду", label: "Название", initial: t.name });
                    if (name && name !== t.name) send({ type: "rename_team", team_id: t.id, name });
                  }}
                >
                  ✎
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="input-xs"
                  title="Удалить"
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: `Удалить команду «${t.name}»?`,
                      message: "Команда пропадёт из игры вместе с очками.",
                      confirmLabel: "Удалить",
                      danger: true,
                    });
                    if (ok) send({ type: "delete_team", team_id: t.id });
                  }}
                >
                  ✕
                </ActionIcon>
              </Group>
            </Box>
          </Fragment>
        ))}
      </Stack>
    </Paper>
  );
}

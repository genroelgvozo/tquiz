import { Badge, Button, Group, Paper, Table, Text } from "@mantine/core";
import type { Answer } from "../../lib/types";
import { SectionLabel } from "../ui";
import { hasAnswer } from "./check";
import type { PanelProps } from "./types";

export default function CheckTable({ view, send }: PanelProps) {
  const round = view.state.round_index >= 0 ? view.quiz.rounds[view.state.round_index] : undefined;
  const free = view.state.free;
  if (!round || !free) return null;
  const teams = view.state.teams;
  const rows = round.questions.map((q, i) => ({ q, i })).filter(({ q }) => free.opened.includes(q.id));

  return (
    <Paper withBorder p="md">
      <SectionLabel>Проверка</SectionLabel>
      {rows.length === 0 ? (
        <Text c="dimmed">Пока ни один вопрос не открыт.</Text>
      ) : (
        <Table.ScrollContainer minWidth={420}>
          <Table verticalSpacing="xs" horizontalSpacing="xs" layout="fixed">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={64} />
                {teams.map((t) => (
                  <Table.Th key={t.id}>{t.name}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(({ q, i }) => {
                const current = free.phase === "question" && free.index === i;
                const shown = free.revealed.includes(q.id);
                const answers = free.answers[String(q.id)] ?? {};
                const marks = free.marks[String(q.id)] ?? {};
                const label = (a: Answer) =>
                  a.option !== null ? `${String.fromCharCode(65 + a.option)}. ${q.options[a.option] ?? ""}` : a.text;
                return (
                  <Table.Tr key={q.id}>
                    <Table.Td fw={700}>
                      {i + 1} {current && <span title="идёт сейчас">●</span>}
                      {shown && <span title="показан на экране"> ✔</span>}
                    </Table.Td>
                    {teams.map((t) => {
                      const a = answers[t.id];
                      if (!a || !hasAnswer(a)) {
                        const waiting = current && free.timer.status !== "finished";
                        return (
                          <Table.Td key={t.id}>
                            <Group gap={6} wrap="nowrap">
                              <Text c="dimmed">{waiting ? "ждём…" : "—"}</Text>
                              {a?.stake && <Badge color="yellow">ставка</Badge>}
                            </Group>
                          </Table.Td>
                        );
                      }
                      const m = marks[t.id] ?? null;
                      const mark = (value: boolean) =>
                        send({
                          type: "mark",
                          question_id: q.id,
                          team_id: t.id,
                          correct: m === value ? null : value, // clicking the active mark clears it
                          text: a.text,
                          option: a.option,
                        });
                      return (
                        <Table.Td key={t.id}>
                          <Group gap={6} wrap="nowrap">
                            <Text size="sm" truncate flex={1} miw={0} title={label(a)}>
                              {label(a)}
                            </Text>
                            {a.stake && <Badge color="yellow">ставка</Badge>}
                            <Button size="compact-sm" color="green" variant={m === true ? "filled" : "default"} onClick={() => mark(true)}>
                              ✓
                            </Button>
                            <Button size="compact-sm" color="red" variant={m === false ? "filled" : "default"} onClick={() => mark(false)}>
                              ✗
                            </Button>
                          </Group>
                        </Table.Td>
                      );
                    })}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Text c="dimmed" size="xs" mt="xs">
        ✔ — показан на экране · ● — идёт сейчас
      </Text>
    </Paper>
  );
}

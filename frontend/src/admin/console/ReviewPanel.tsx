import { Badge, Button, Group, Paper, Stack, Table, Text } from "@mantine/core";
import { QuestionBox } from "./common";
import type { PanelProps } from "./types";

export default function ReviewPanel({ view, send }: PanelProps) {
  const round = view.quiz.rounds[view.state.round_index];
  const free = view.state.free;
  if (!round || !free) return null;
  const q = round.questions[free.review_index];
  const total = round.questions.length;
  const answers = free.answers[String(q.id)] ?? {};
  const marks = free.marks[String(q.id)] ?? {};

  const mark = (teamId: string, value: boolean) => {
    const next = marks[teamId] === value ? null : value; // clicking the active mark clears it
    send({ type: "mark", question_id: q.id, team_id: teamId, correct: next });
  };

  const reference =
    q.options.length > 0 && q.correct_option !== null
      ? `${String.fromCharCode(65 + q.correct_option)}. ${q.options[q.correct_option]}`
      : q.answer || "—";

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group gap="xs">
          <Button
            variant="default"
            disabled={free.review_index === 0}
            onClick={() => send({ type: "review_goto", index: free.review_index - 1 })}
          >
            ← Вопрос {free.review_index}
          </Button>
          <Text fw={700}>
            Разбор {free.review_index + 1} / {total}
          </Text>
          <Button
            variant="default"
            disabled={free.review_index >= total - 1}
            onClick={() => send({ type: "review_goto", index: free.review_index + 1 })}
          >
            Вопрос {free.review_index + 2} →
          </Button>
        </Group>

        <QuestionBox text={q.text} answer={`${reference} · номинал ${q.nominal}`} />

        <Table verticalSpacing="xs" horizontalSpacing={0}>
          <Table.Tbody>
            {view.state.teams.map((team) => {
              const a = answers[team.id];
              let shown: string | null = null;
              if (a && q.options.length > 0 && a.option !== null)
                shown = `${String.fromCharCode(65 + a.option)}. ${q.options[a.option] ?? ""}`;
              else if (a && a.text.trim()) shown = a.text;
              const m = marks[team.id];
              return (
                <Table.Tr key={team.id}>
                  <Table.Td w={140} fw={700}>
                    {team.name}
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      {shown ?? <Text c="dimmed">— нет ответа —</Text>}
                      {a?.stake && <Badge color="yellow">ставка</Badge>}
                    </Group>
                  </Table.Td>
                  <Table.Td w={1}>
                    <Group gap="xs" wrap="nowrap">
                      <Button color="green" variant={m === true ? "filled" : "default"} onClick={() => mark(team.id, true)}>
                        ✓
                      </Button>
                      <Button color="red" variant={m === false ? "filled" : "default"} onClick={() => mark(team.id, false)}>
                        ✗
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
        <Text c="dimmed">Совпадения с эталоном и варианты отмечены заранее — проверь и поправь при необходимости.</Text>
      </Stack>
    </Paper>
  );
}

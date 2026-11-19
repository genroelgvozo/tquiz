import { Button, Group, Paper, Stack, Text } from "@mantine/core";
import { QuestionBox } from "./common";
import type { PanelProps } from "./types";

/** Review only drives the hall screen; marks live in the check table. */
export default function ReviewPanel({ view, send }: PanelProps) {
  const round = view.quiz.rounds[view.state.round_index];
  const free = view.state.free;
  if (!round || !free) return null;
  const q = round.questions[free.review_index];
  const total = round.questions.length;

  const reference =
    q.options.length > 0 && q.correct_option !== null
      ? `${String.fromCharCode(65 + q.correct_option)}. ${q.options[q.correct_option]}`
      : q.answer || "—";

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group gap="xs">
          <Button variant="default" disabled={free.review_index === 0} onClick={() => send({ type: "review_goto", index: free.review_index - 1 })}>
            ←
          </Button>
          <Text fw={700}>
            На экране: ответ на вопрос {free.review_index + 1} / {total}
          </Text>
          <Button
            variant="default"
            disabled={free.review_index >= total - 1}
            onClick={() => send({ type: "review_goto", index: free.review_index + 1 })}
          >
            →
          </Button>
        </Group>

        <QuestionBox text={q.text} answer={`${reference} · номинал ${q.nominal}`} />
      </Stack>
    </Paper>
  );
}

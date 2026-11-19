import { Box, Button, Group, List, Paper, Stack, Text } from "@mantine/core";
import { PhaseTimerBar } from "../../components/PhaseTimerBar";
import { useServerClock } from "../../lib/clock";
import { confirmDialog } from "../dialogs";
import { AudioControls, QuestionBox } from "./common";
import type { PanelProps } from "./types";

export default function FreePanel({ view, send }: PanelProps) {
  const round = view.quiz.rounds[view.state.round_index];
  const free = view.state.free;
  const now = useServerClock(view.now);
  if (!round || !free) return null;
  const q = round.questions[free.index];
  const total = round.questions.length;
  const t = free.timer;

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group gap="xs">
          <Button variant="default" disabled={free.index === 0} onClick={() => send({ type: "open_question", index: free.index - 1 })}>
            ←
          </Button>
          <Text fw={700}>
            Вопрос {free.index + 1} / {total}
          </Text>
          <Button
            variant="default"
            disabled={free.index >= total - 1}
            onClick={() => send({ type: "open_question", index: free.index + 1 })}
          >
            →
          </Button>
          <Button
            ml="auto"
            variant={free.index >= total - 1 ? "filled" : "default"}
            onClick={async () => {
              const early = free.index < total - 1 || (t.status !== "finished" && t.status !== "idle");
              const ok =
                !early ||
                (await confirmDialog({
                  title: "Начать разбор?",
                  message: "Вернуться к вопросам этого тура будет нельзя.",
                  confirmLabel: "Начать разбор",
                }));
              if (ok) send({ type: "start_review" });
            }}
          >
            Начать разбор
          </Button>
        </Group>

        <QuestionBox text={q.text} answer={`${q.answer || "—"} · номинал ${q.nominal}`}>
          {q.options.length > 0 && (
            <List type="ordered" listStyleType="upper-alpha" size="sm" mt="xs" style={{ whiteSpace: "normal" }}>
              {q.options.map((o, i) => (
                <List.Item key={i} fw={i === q.correct_option ? 700 : 400}>
                  {o} {i === q.correct_option && "✓"}
                </List.Item>
              ))}
            </List>
          )}
        </QuestionBox>

        {q.media?.kind === "audio" && <AudioControls send={send} />}

        {/* the timer bar is shared with the hall screen; .light-timer recolours it for the light admin */}
        <Box className="light-timer">
          <PhaseTimerBar timer={t} now={now} />
        </Box>
        <Group gap="xs">
          {t.status === "idle" && <Button onClick={() => send({ type: "timer_start" })}>Запустить таймер</Button>}
          {t.status === "running" && (
            <Button variant="default" onClick={() => send({ type: "timer_pause" })}>
              Пауза
            </Button>
          )}
          {t.status === "paused" && (
            <Button variant="default" onClick={() => send({ type: "timer_resume" })}>
              Продолжить
            </Button>
          )}
          {(t.status === "running" || t.status === "paused") && (
            <>
              <Button variant="default" onClick={() => send({ type: "timer_add" })}>
                +10 с
              </Button>
              <Button variant="default" onClick={() => send({ type: "timer_finish" })}>
                Завершить
              </Button>
            </>
          )}
          {t.status === "finished" && <Text c="dimmed">Время вышло</Text>}
        </Group>
      </Stack>
    </Paper>
  );
}

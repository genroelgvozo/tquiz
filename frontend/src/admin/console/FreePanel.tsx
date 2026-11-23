import { Box, Button, Group, Kbd, List, Paper, Stack, Text } from "@mantine/core";
import { PhaseTimerBar } from "../../components/PhaseTimerBar";
import { useServerClock } from "../../lib/clock";
import { confirmDialog } from "../dialogs";
import { AudioControls, QuestionBox } from "./common";
import { freeNavConfirm } from "./freeNav";
import type { PanelProps } from "./types";
import { useConsoleHotkeys } from "./useConsoleHotkeys";

const TIMER_KEY_COMMAND = { idle: "timer_start", running: "timer_pause", paused: "timer_resume" } as const;

export default function FreePanel({ view, send }: PanelProps) {
  const round = view.quiz.rounds[view.state.round_index];
  const free = view.state.free;
  const now = useServerClock(view.now);
  const index = free?.index ?? 0;
  const total = round?.questions.length ?? 0;

  // ← / → ask first when the move closes a running timer or reopens a question
  const go = async (target: number) => {
    const spec = freeNavConfirm(view, target);
    if (spec && !(await confirmDialog(spec))) return;
    send({ type: "open_question", index: target });
  };
  const timerStatus = free?.timer.status;
  const timerCmd = timerStatus && timerStatus !== "finished" ? TIMER_KEY_COMMAND[timerStatus] : null;
  useConsoleHotkeys([
    ["arrowleft", free && index > 0 ? () => void go(index - 1) : null],
    ["arrowright", free && index < total - 1 ? () => void go(index + 1) : null],
    ["space", timerCmd ? () => send({ type: timerCmd }) : null],
  ]);

  if (!round || !free) return null;
  const q = round.questions[free.index];
  const t = free.timer;
  const space = <Kbd size="xs">Space</Kbd>;

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group gap="xs">
          <Button variant="default" disabled={free.index === 0} title="Клавиша ←" onClick={() => void go(free.index - 1)}>
            ←
          </Button>
          <Text fw={700}>
            Вопрос {free.index + 1} / {total}
          </Text>
          <Button
            variant="default"
            disabled={free.index >= total - 1}
            title="Клавиша →"
            onClick={() => void go(free.index + 1)}
          >
            →
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
          {t.status === "idle" && (
            <Button onClick={() => send({ type: "timer_start" })} rightSection={space}>
              Запустить таймер
            </Button>
          )}
          {t.status === "running" && (
            <Button variant="default" onClick={() => send({ type: "timer_pause" })} rightSection={space}>
              Пауза
            </Button>
          )}
          {t.status === "paused" && (
            <Button variant="default" onClick={() => send({ type: "timer_resume" })} rightSection={space}>
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

import { Alert, Box, Button, Grid, Group, Paper, Select, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { QuestionData, TypingView } from "../../lib/types";
import { layoutBoard } from "../../lib/board";
import { useServerClock, useTicker } from "../../lib/clock";
import { typedChars } from "../../lib/typing";
import { SectionLabel } from "../ui";
import { AudioControls, QuestionBox } from "./common";
import type { PanelProps } from "./types";

/** The question while the screen is printing it: redrawn as the printed part grows. */
function PrintingQuestionBox(props: { text: string; answer: ReactNode; typing: TypingView; now: () => number }) {
  useTicker(100);
  const typed = typedChars(props.typing, props.now(), props.text.length);
  return <QuestionBox text={props.text} answer={props.answer} typed={typed} />;
}

export default function JeopardyPanel({ view, send }: PanelProps) {
  const now = useServerClock(view.now);
  const round = view.quiz.rounds[view.state.round_index];
  const j = view.state.jeopardy;
  if (!round || !j) return null;
  const teams = view.state.teams;
  const name = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "—";
  const { columns, rows } = layoutBoard(round.categories.map((c) => c.questions));
  const colCount = Math.max(1, columns.length);

  let current: QuestionData | undefined;
  let currentCat = "";
  for (const c of round.categories) {
    const found = c.questions.find((q) => q.id === j.question_id);
    if (found) {
      current = found;
      currentCat = c.name;
    }
  }
  const hasAudio = current?.media?.kind === "audio";
  // the screen prints a plain question letter by letter: the host sees how far it got
  const typing: TypingView | null =
    round.typewriter && j.phase === "question" && current && !current.is_secret
      ? { base: j.typed_base, since: j.typing_since, speed: round.type_speed }
      : null;
  const canOpen = j.phase === "board" || j.phase === "answer";
  const firstAt = j.buzzes[0]?.at ?? 0;

  return (
    <Paper withBorder p="md">
      <Grid>
        <Grid.Col span={{ base: 12, sm: 5 }}>
          <SectionLabel>Сетка — клик открывает вопрос</SectionLabel>
          {/* own layout: Mantine has no compact board of cells */}
          <div className="mini-grid" style={{ gridTemplateColumns: `1.3fr repeat(${colCount}, 1fr)` }}>
            {round.categories.map((c, ci) => (
              <div key={c.id} style={{ display: "contents" }}>
                <div className="cat" title={c.name}>
                  {c.name}
                </div>
                {rows[ci].map((q, i) => {
                  if (!q) return <span key={`empty-${i}`} />;
                  const played = j.played.includes(q.id);
                  return (
                    <button
                      key={`q-${q.id}`}
                      className={`${played ? "played" : ""} ${q.id === j.question_id ? "current" : ""}`}
                      disabled={played || !canOpen}
                      title={q.is_secret ? "секрет" : q.text}
                      onClick={() => send({ type: "open_cell", question_id: q.id })}
                    >
                      {q.value}
                      {q.is_secret ? "🎁" : ""}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <Select
            label="Выбирает"
            placeholder="— выберите —"
            maw={220}
            data={teams.map((t) => ({ value: t.id, label: t.name }))}
            allowDeselect={false}
            value={j.chooser_team_id}
            disabled={!canOpen}
            onChange={(v) => v && send({ type: "set_chooser", team_id: v })}
          />
        </Grid.Col>

        <Grid.Col span={{ base: 12, sm: 7 }}>
          {!current || j.phase === "board" ? (
            <Text c="dimmed">
              {j.played.length === round.categories.reduce((n, c) => n + c.questions.length, 0)
                ? "Все вопросы сыграны — переходите к следующему туру."
                : "Выберите вопрос в сетке."}
            </Text>
          ) : (
            <Box>
              <SectionLabel>
                {currentCat} · {current.value} {current.is_secret && "· секрет"}
              </SectionLabel>
              <Stack gap="sm">
                {typing && typing.since !== null ? (
                  <PrintingQuestionBox text={current.text} answer={current.answer || "—"} typing={typing} now={now} />
                ) : (
                  <QuestionBox
                    text={current.text}
                    answer={current.answer || "—"}
                    typed={typing ? typedChars(typing, now(), current.text.length) : undefined}
                  />
                )}

                {hasAudio && <AudioControls send={send} />}

                {j.phase === "secret" && (
                  <Alert color="yellow" variant="light">
                    <Text size="md" mb="xs">
                      Кому передать секрет?
                    </Text>
                    <Group gap="xs">
                      {teams
                        .filter((t) => t.id !== j.chooser_team_id)
                        .map((t) => (
                          <Button key={t.id} variant="default" onClick={() => send({ type: "set_secret_recipient", team_id: t.id })}>
                            {t.name}
                          </Button>
                        ))}
                    </Group>
                  </Alert>
                )}

                {j.phase === "question" && (
                  <Alert color="yellow" variant="light">
                    {j.answering_team_id ? (
                      <>
                        <Text size="md" mb="xs">
                          Отвечает: <b>{name(j.answering_team_id)}</b>
                          {j.buzzes.length > 1 && (
                            <Text span c="dimmed" inherit>
                              {" "}
                              {j.buzzes
                                .slice(1)
                                .map((b) => `${name(b.team_id)} +${(b.at - firstAt).toFixed(2)} с`)
                                .join(", ")}
                            </Text>
                          )}
                        </Text>
                        <Group gap="xs">
                          <Button color="green" variant="light" onClick={() => send({ type: "judge", correct: true })}>
                            ✓ Верно +{current.value}
                          </Button>
                          <Button color="red" variant="light" onClick={() => send({ type: "judge", correct: false })}>
                            ✗ Неверно{round.minus_on_wrong ? ` −${current.value}` : ""}
                          </Button>
                        </Group>
                      </>
                    ) : j.starts_at !== null ? (
                      <Group gap="sm">
                        <Text>Вопрос раскрывается на экране…</Text>
                        <Button variant="default" onClick={() => send({ type: "open_buttons" })}>
                          Открыть кнопки сейчас
                        </Button>
                      </Group>
                    ) : j.buttons === "bar" ? (
                      <Group gap="sm">
                        <Text>Полоска идёт…</Text>
                        <Button variant="default" onClick={() => send({ type: "open_buttons" })}>
                          Открыть кнопки сейчас
                        </Button>
                      </Group>
                    ) : (
                      <Text>
                        Кнопки открыты — ждём нажатия
                        {j.excluded.length > 0 && (
                          <Text span c="dimmed" inherit>
                            {" "}
                            (уже отвечали: {j.excluded.map(name).join(", ")})
                          </Text>
                        )}
                      </Text>
                    )}
                  </Alert>
                )}

                <Group gap="xs">
                  {(j.phase === "question" || j.phase === "secret") && (
                    <Button variant="default" onClick={() => send({ type: "reveal" })}>
                      Показать ответ
                    </Button>
                  )}
                  <Button variant={j.phase === "answer" ? "filled" : "default"} onClick={() => send({ type: "to_board" })}>
                    К сетке →
                  </Button>
                </Group>
              </Stack>
            </Box>
          )}
        </Grid.Col>
      </Grid>
    </Paper>
  );
}

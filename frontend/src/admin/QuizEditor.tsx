import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Fieldset,
  FileButton,
  Grid,
  Group,
  NavLink,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, uploadMedia } from "../lib/api";
import type { EditorPayload, QuestionData, RoundData } from "../lib/types";
import { confirmDialog, newRoundDialog, promptDialog } from "./dialogs";
import { notifyApiError, notifyError } from "./notify";
import QuestionForm from "./QuestionForm";
import RoundSettings from "./RoundSettings";
import { ROUND_KINDS } from "./roundKinds";
import { startGame } from "./startGame";
import { SectionLabel } from "./ui";

type Selection = { kind: "round"; id: number } | { kind: "question"; id: number } | null;

export type Mutate = (method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown) => Promise<boolean>;

/** Small icon button for tree rows; stops the click from selecting the row underneath. */
function RowAction(props: { title?: string; onClick: () => void; children: ReactNode }) {
  return (
    <ActionIcon
      variant="subtle"
      color="gray"
      size="sm"
      title={props.title}
      onClick={(e: MouseEvent) => {
        e.stopPropagation();
        props.onClick();
      }}
    >
      {props.children}
    </ActionIcon>
  );
}

export default function QuizEditor() {
  const { id } = useParams();
  const quizId = Number(id);
  const navigate = useNavigate();
  const [payload, setPayload] = useState<EditorPayload | null>(null);
  const [selection, setSelection] = useState<Selection>(null);

  useEffect(() => {
    api<EditorPayload>("GET", `/api/quizzes/${quizId}`)
      .then(setPayload)
      .catch((e) => notifyApiError(e, "Не удалось загрузить квиз"));
  }, [quizId]);

  const mutate: Mutate = useCallback(async (method, path, body) => {
    try {
      const p = await api<EditorPayload>(method, path, body);
      setPayload(p);
      return true;
    } catch (e) {
      notifyApiError(e, "Ошибка сохранения");
      return false;
    }
  }, []);

  if (!payload) return null;
  const { quiz, locked } = payload;
  const isSelected = (kind: "round" | "question", itemId: number) => selection?.kind === kind && selection.id === itemId;

  const selectedRound: RoundData | undefined =
    selection?.kind === "round" ? quiz.rounds.find((r) => r.id === selection.id) : undefined;
  let selectedQuestion: QuestionData | undefined;
  let questionRound: RoundData | undefined;
  if (selection?.kind === "question") {
    for (const r of quiz.rounds) {
      const all = r.kind === "jeopardy" ? r.categories.flatMap((c) => c.questions) : r.questions;
      const found = all.find((q) => q.id === selection.id);
      if (found) {
        selectedQuestion = found;
        questionRound = r;
      }
    }
  }

  const addRound = async () => {
    const choice = await newRoundDialog();
    if (choice) await mutate("POST", `/api/quizzes/${quizId}/rounds`, choice);
  };

  const renameCategory = async (categoryId: number, current: string) => {
    const name = await promptDialog({ title: "Переименовать тему", label: "Название", initial: current });
    if (name !== null && name !== current) mutate("PATCH", `/api/categories/${categoryId}`, { name });
  };

  const deleteCategory = async (categoryId: number, name: string) => {
    const ok = await confirmDialog({
      title: `Удалить тему «${name}»?`,
      message: "Вместе с ней удалятся все её вопросы.",
      confirmLabel: "Удалить",
      danger: true,
    });
    if (ok) mutate("DELETE", `/api/categories/${categoryId}`);
  };

  const addCategory = async (roundId: number) => {
    const name = await promptDialog({ title: "Новая тема", label: "Название", confirmLabel: "Добавить" });
    if (name !== null) mutate("POST", `/api/rounds/${roundId}/categories`, { name });
  };

  const addQuestion = async (round: RoundData, categoryId?: number) => {
    const before = new Set(
      (round.kind === "jeopardy" ? round.categories.flatMap((c) => c.questions) : round.questions).map((q) => q.id),
    );
    try {
      const p = await api<EditorPayload>("POST", `/api/rounds/${round.id}/questions`, {
        category_id: categoryId ?? null,
      });
      setPayload(p);
      const r = p.quiz.rounds.find((x) => x.id === round.id);
      const all = r ? (r.kind === "jeopardy" ? r.categories.flatMap((c) => c.questions) : r.questions) : [];
      const created = all.find((q) => !before.has(q.id));
      if (created) setSelection({ kind: "question", id: created.id });
    } catch (e) {
      notifyApiError(e, "Ошибка");
    }
  };

  const uploadLogo = async (file: File | null) => {
    if (!file) return;
    try {
      const media = await uploadMedia(file);
      if (media.kind !== "image") {
        notifyError("Эмблема должна быть картинкой");
        return;
      }
      await mutate("PATCH", `/api/quizzes/${quizId}`, { logo_filename: media.filename });
    } catch (e) {
      notifyApiError(e, "Не удалось загрузить файл");
    }
  };

  const start = async () => {
    try {
      if (await startGame(quizId)) navigate("/admin/game");
    } catch (e) {
      notifyApiError(e, "Не удалось начать игру");
    }
  };

  return (
    <Stack>
      {locked && (
        <Alert color="yellow" variant="light">
          Идёт игра — редактирование недоступно
        </Alert>
      )}

      <Group wrap="nowrap">
        <Avatar src={quiz.logo?.url} size={40} />
        <TextInput
          key={quiz.title}
          flex={1}
          miw={120}
          size="md"
          disabled={locked}
          defaultValue={quiz.title}
          styles={{ input: { fontSize: "var(--mantine-font-size-xl)", fontWeight: 700 } }}
          onBlur={(e) => {
            const title = e.target.value.trim();
            if (title && title !== quiz.title) mutate("PATCH", `/api/quizzes/${quizId}`, { title });
          }}
        />
        <FileButton accept="image/*" onChange={uploadLogo} disabled={locked}>
          {(props) => (
            <Button variant="default" {...props}>
              Загрузить эмблему
            </Button>
          )}
        </FileButton>
        {quiz.logo && (
          <Button
            variant="default"
            disabled={locked}
            onClick={() => mutate("PATCH", `/api/quizzes/${quizId}`, { logo_filename: null })}
          >
            Убрать эмблему
          </Button>
        )}
        <Button onClick={start}>Начать игру</Button>
      </Group>

      <Grid align="flex-start">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Fieldset variant="unstyled" disabled={locked} m={0}>
            <Paper withBorder p="sm">
              <SectionLabel>Туры</SectionLabel>
              <Stack gap="sm">
                {quiz.rounds.map((r, i) => (
                  <div key={r.id}>
                    <NavLink
                      component="div"
                      color="blue"
                      bdrs="sm"
                      noWrap
                      active={isSelected("round", r.id)}
                      onClick={() => setSelection({ kind: "round", id: r.id })}
                      label={
                        <Text span fw={600}>
                          {i + 1}. {r.title || "Без названия"}
                        </Text>
                      }
                      rightSection={
                        <Group gap={4} wrap="nowrap">
                          <Badge>{ROUND_KINDS[r.kind].short}</Badge>
                          {r.kind === "free" && r.stakes && <Badge color="yellow">ставки</Badge>}
                          <RowAction title="Выше" onClick={() => mutate("POST", `/api/rounds/${r.id}/move`, { delta: -1 })}>
                            ↑
                          </RowAction>
                          <RowAction title="Ниже" onClick={() => mutate("POST", `/api/rounds/${r.id}/move`, { delta: 1 })}>
                            ↓
                          </RowAction>
                        </Group>
                      }
                    />
                    <Stack gap={2} pl="md">
                      {r.kind === "jeopardy" ? (
                        <>
                          {r.categories.map((c) => (
                            <div key={c.id}>
                              <Group gap={4} wrap="nowrap" px="sm" py={4}>
                                <Text flex={1} truncate>
                                  {c.name || "Без названия"}
                                </Text>
                                <RowAction title="Переименовать" onClick={() => renameCategory(c.id, c.name)}>
                                  ✎
                                </RowAction>
                                <RowAction onClick={() => mutate("POST", `/api/categories/${c.id}/move`, { delta: -1 })}>
                                  ↑
                                </RowAction>
                                <RowAction onClick={() => mutate("POST", `/api/categories/${c.id}/move`, { delta: 1 })}>
                                  ↓
                                </RowAction>
                                <RowAction title="Удалить тему" onClick={() => deleteCategory(c.id, c.name)}>
                                  ✕
                                </RowAction>
                              </Group>
                              <Group gap={4} px="sm" pb="xs">
                                {c.questions.map((q) => (
                                  <Button
                                    key={q.id}
                                    size="compact-sm"
                                    variant={isSelected("question", q.id) ? "filled" : "default"}
                                    style={q.is_secret ? { borderStyle: "dashed" } : undefined}
                                    title={q.text}
                                    onClick={() => setSelection({ kind: "question", id: q.id })}
                                  >
                                    {q.value}
                                    {q.is_secret ? " 🎁" : ""}
                                    {q.media ? (q.media.kind === "audio" ? " ♪" : " ▣") : ""}
                                  </Button>
                                ))}
                                <Button size="compact-sm" variant="default" onClick={() => addQuestion(r, c.id)}>
                                  +
                                </Button>
                              </Group>
                            </div>
                          ))}
                          <AddButton onClick={() => addCategory(r.id)}>+ тема</AddButton>
                        </>
                      ) : (
                        <>
                          {r.questions.map((q, qi) => (
                            <NavLink
                              key={q.id}
                              component="div"
                              color="blue"
                              bdrs="sm"
                              noWrap
                              active={isSelected("question", q.id)}
                              onClick={() => setSelection({ kind: "question", id: q.id })}
                              label={
                                <>
                                  {qi + 1}.{" "}
                                  {q.text || (
                                    <Text span c="dimmed" inherit>
                                      пустой вопрос
                                    </Text>
                                  )}
                                </>
                              }
                              rightSection={
                                (q.options.length > 0 || q.media) && (
                                  <Group gap={4} wrap="nowrap">
                                    {q.options.length > 0 && <Badge>варианты</Badge>}
                                    {q.media && <Badge>{q.media.kind === "audio" ? "♪" : "▣"}</Badge>}
                                  </Group>
                                )
                              }
                            />
                          ))}
                          <AddButton onClick={() => addQuestion(r)}>+ вопрос</AddButton>
                        </>
                      )}
                    </Stack>
                  </div>
                ))}
                <Button variant="light" color="blue" onClick={addRound}>
                  + тур
                </Button>
              </Stack>
            </Paper>
          </Fieldset>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 8 }}>
          <Fieldset variant="unstyled" disabled={locked} m={0}>
            <Paper withBorder p="md">
              {selectedRound && (
                <RoundSettings
                  key={selectedRound.id}
                  round={selectedRound}
                  mutate={mutate}
                  onDeleted={() => setSelection(null)}
                />
              )}
              {selectedQuestion && questionRound && (
                <QuestionForm
                  key={selectedQuestion.id}
                  question={selectedQuestion}
                  round={questionRound}
                  mutate={mutate}
                  onDeleted={() => setSelection(null)}
                />
              )}
              {!selectedRound && !selectedQuestion && <Text c="dimmed">Выберите тур или вопрос слева.</Text>}
            </Paper>
          </Fieldset>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

function AddButton(props: { onClick: () => void; children: ReactNode }) {
  return (
    <Box>
      <Button variant="subtle" color="gray" size="compact-sm" onClick={props.onClick}>
        {props.children}
      </Button>
    </Box>
  );
}

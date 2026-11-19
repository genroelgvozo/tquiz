import { Anchor, Badge, Button, Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { EditorPayload, QuizListItem } from "../lib/types";
import { confirmDialog, promptDialog } from "./dialogs";
import { notifyApiError, notifyError } from "./notify";
import { startGame } from "./startGame";

export default function QuizList() {
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const navigate = useNavigate();

  const load = () => {
    api<QuizListItem[]>("GET", "/api/quizzes")
      .then(setQuizzes)
      .catch((e) => notifyError(String(e.message)));
  };
  useEffect(load, []);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      notifyApiError(e, "Ошибка");
    }
  };

  const create = () =>
    run(async () => {
      const title = await promptDialog({ title: "Новый квиз", label: "Название", initial: "Новый квиз", confirmLabel: "Создать" });
      if (!title) return;
      const p = await api<EditorPayload>("POST", "/api/quizzes", { title });
      navigate(`/admin/quiz/${p.quiz.id}`);
    });

  const copy = (id: number) =>
    run(async () => {
      await api<EditorPayload>("POST", `/api/quizzes/${id}/copy`);
      load();
    });

  const remove = (q: QuizListItem) =>
    run(async () => {
      const ok = await confirmDialog({
        title: `Удалить квиз «${q.title}»?`,
        message: "Все туры и вопросы квиза удалятся без возможности восстановления.",
        confirmLabel: "Удалить",
        danger: true,
      });
      if (!ok) return;
      await api("DELETE", `/api/quizzes/${q.id}`);
      load();
    });

  const start = (id: number) =>
    run(async () => {
      if (await startGame(id)) navigate("/admin/game");
    });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>Квизы</Title>
        <Button onClick={create}>+ Создать</Button>
      </Group>
      <Paper withBorder>
        {quizzes.length === 0 ? (
          <Text c="dimmed" p="md">
            Пока нет квизов
          </Text>
        ) : (
          <Table verticalSpacing="sm" horizontalSpacing="md">
            <Table.Tbody>
              {quizzes.map((q) => (
                <Table.Tr key={q.id}>
                  <Table.Td>
                    <Group gap="sm">
                      <Anchor component={Link} to={`/admin/quiz/${q.id}`} c="dark" fw={600} size="sm">
                        {q.title}
                      </Anchor>
                      {q.locked && <Badge color="yellow">идёт игра</Badge>}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                      <Button variant="default" onClick={() => copy(q.id)}>
                        Копировать
                      </Button>
                      <Button variant="default" onClick={() => remove(q)} disabled={q.locked}>
                        Удалить
                      </Button>
                      <Button onClick={() => start(q.id)}>Начать игру</Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}

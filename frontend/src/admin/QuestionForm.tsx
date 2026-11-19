import {
  ActionIcon,
  Box,
  Button,
  FileButton,
  Group,
  Image,
  Input,
  NumberInput,
  Radio,
  Select,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useState } from "react";
import { uploadMedia } from "../lib/api";
import type { QuestionData, RoundData } from "../lib/types";
import { confirmDialog } from "./dialogs";
import { notifyApiError } from "./notify";
import type { Mutate } from "./QuizEditor";
import { SectionLabel } from "./ui";

const MAX_OPTIONS = 4;

const QUESTION_TYPES = [
  { value: "normal", label: "обычный" },
  { value: "secret", label: "секрет" },
];

export default function QuestionForm({
  question,
  round,
  mutate,
  onDeleted,
}: {
  question: QuestionData;
  round: RoundData;
  mutate: Mutate;
  onDeleted: () => void;
}) {
  const path = `/api/questions/${question.id}`;
  const patch = (body: Record<string, unknown>) => mutate("PATCH", path, body);
  const isJeopardy = round.kind === "jeopardy";

  // options are edited locally and saved as a whole (server validates 2–4 non-empty)
  const [options, setOptions] = useState<string[]>(question.options);
  const [correct, setCorrect] = useState<number | null>(question.correct_option);
  const [uploading, setUploading] = useState(false);

  const saveOptions = (next: string[], nextCorrect: number | null) => {
    const filled = next.map((o) => o.trim());
    if (filled.length > 0 && (filled.length < 2 || filled.some((o) => !o))) return; // wait until valid
    patch({ options: filled, correct_option: filled.length ? nextCorrect : null });
  };

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const media = await uploadMedia(file);
      await patch({ media_filename: media.filename, media_kind: media.kind });
    } catch (e) {
      notifyApiError(e, "Не удалось загрузить файл");
    } finally {
      setUploading(false);
    }
  };

  const textField = (label: string, key: "text" | "answer", rows = 3) => (
    <Textarea
      label={label}
      rows={rows}
      resize="vertical"
      defaultValue={question[key]}
      onBlur={(e) => e.target.value !== question[key] && patch({ [key]: e.target.value })}
    />
  );

  const optionalNumber = (label: string, key: "discuss_seconds" | "input_seconds", fallback: number) => (
    <NumberInput
      label={label}
      min={0}
      placeholder={`как в туре (${fallback})`}
      defaultValue={question[key] ?? ""}
      onBlur={(e) => {
        const raw = e.currentTarget.value.trim();
        const v = raw === "" ? null : Number(raw);
        if (v !== question[key]) patch({ [key]: v });
      }}
    />
  );

  const integerField = (label: string, key: "value" | "nominal", min?: number) => (
    <NumberInput
      label={label}
      min={min}
      defaultValue={question[key]}
      onBlur={(e) => Number(e.currentTarget.value) !== question[key] && patch({ [key]: Number(e.currentTarget.value) })}
    />
  );

  return (
    <Stack>
      <Box>
        <SectionLabel>Вопрос</SectionLabel>
        {isJeopardy ? (
          <SimpleGrid cols={2}>
            <Select
              label="Тип"
              data={QUESTION_TYPES}
              allowDeselect={false}
              value={question.is_secret ? "secret" : "normal"}
              onChange={(v) => patch({ is_secret: v === "secret" })}
            />
            {integerField("Стоимость", "value")}
          </SimpleGrid>
        ) : (
          <Box maw={200}>{integerField("Номинал", "nominal", 0)}</Box>
        )}
      </Box>

      {textField("Текст вопроса", "text", 4)}
      {textField("Правильный ответ (видишь только ты)", "answer", 2)}

      <Input.Wrapper label="Медиа (картинка или аудио)">
        <Group gap="xs" mt={4}>
          <FileButton accept="image/*,audio/*,.mp3,.m4a,.ogg,.wav" onChange={onUpload}>
            {(props) => (
              <Button variant="default" loading={uploading} {...props}>
                {question.media ? "Заменить файл" : "Загрузить файл"}
              </Button>
            )}
          </FileButton>
          {question.media && (
            <Button variant="default" onClick={() => patch({ media_filename: null, media_kind: null })}>
              Убрать
            </Button>
          )}
        </Group>
        {question.media && (
          <Box mt="xs">
            {question.media.kind === "image" ? (
              <Image src={question.media.url} alt="" maw={260} mah={160} w="auto" fit="contain" radius="sm" />
            ) : (
              <audio controls src={question.media.url} preload="none" />
            )}
          </Box>
        )}
      </Input.Wrapper>

      {!isJeopardy && (
        <>
          <Input.Wrapper label="Варианты ответа (необязательно, до 4) — отметь правильный">
            <Stack gap={6} mt={4}>
              {options.map((opt, i) => (
                <Group key={i} gap="xs" wrap="nowrap">
                  <Radio
                    name={`correct-${question.id}`}
                    aria-label={`Вариант ${String.fromCharCode(65 + i)} правильный`}
                    checked={correct === i}
                    onChange={() => {
                      setCorrect(i);
                      saveOptions(options, i);
                    }}
                  />
                  <TextInput
                    flex={1}
                    value={opt}
                    placeholder={`Вариант ${String.fromCharCode(65 + i)}`}
                    onChange={(e) => setOptions(options.map((o, j) => (j === i ? e.currentTarget.value : o)))}
                    onBlur={() => saveOptions(options, correct)}
                  />
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="input-sm"
                    title="Убрать вариант"
                    onClick={() => {
                      const next = options.filter((_, j) => j !== i);
                      const nextCorrect = correct === null || correct === i ? null : correct > i ? correct - 1 : correct;
                      setOptions(next);
                      setCorrect(nextCorrect);
                      if (next.length === 0 || next.length >= 2) saveOptions(next, nextCorrect);
                    }}
                  >
                    ✕
                  </ActionIcon>
                </Group>
              ))}
              {options.length < MAX_OPTIONS && (
                <Box>
                  <Button size="compact-sm" variant="default" onClick={() => setOptions([...options, ""])}>
                    + вариант
                  </Button>
                </Box>
              )}
            </Stack>
          </Input.Wrapper>
          <SimpleGrid cols={2}>
            {optionalNumber("Своё время обсуждения, с", "discuss_seconds", round.discuss_seconds)}
            {optionalNumber("Своё время ввода, с", "input_seconds", round.input_seconds)}
          </SimpleGrid>
        </>
      )}

      <Group>
        <Button
          color="red"
          variant="outline"
          onClick={async () => {
            if (!(await confirmDialog({ title: "Удалить вопрос?", confirmLabel: "Удалить", danger: true }))) return;
            if (await mutate("DELETE", path)) onDeleted();
          }}
        >
          Удалить вопрос
        </Button>
      </Group>
    </Stack>
  );
}

import { Box, ColorInput, Group, SimpleGrid, Stack, UnstyledButton, Text } from "@mantine/core";
import { THEME_PRESETS, presetOf } from "../lib/theme";
import type { QuizData, Theme } from "../lib/types";
import MediaField from "./MediaField";
import type { Mutate } from "./QuizEditor";
import { SectionLabel } from "./ui";

const COLOR_FIELDS: { key: keyof Theme; label: string }[] = [
  { key: "bg", label: "Фон" },
  { key: "text", label: "Текст" },
  { key: "accent", label: "Акцент" },
  { key: "second", label: "Цвет ввода" },
];

export default function QuizAppearance({ quiz, locked, mutate }: { quiz: QuizData; locked: boolean; mutate: Mutate }) {
  const path = `/api/quizzes/${quiz.id}`;
  const active = presetOf(quiz.theme);

  return (
    <Stack>
      <SectionLabel mb={0}>Оформление</SectionLabel>
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        {THEME_PRESETS.map((p) => (
          <UnstyledButton
            key={p.id}
            disabled={locked}
            onClick={() => mutate("PATCH", path, { theme: p.theme })}
            p="xs"
            bd={active === p.id ? "2px solid var(--mantine-primary-color-filled)" : "1px solid var(--mantine-color-default-border)"}
            bdrs="sm"
          >
            <Group gap={0} mb={6} wrap="nowrap" h={14}>
              {[p.theme.bg, p.theme.text, p.theme.accent, p.theme.second].map((c, i) => (
                <Box key={i} flex={1} h="100%" bg={c} />
              ))}
            </Group>
            <Text size="sm" fw={active === p.id ? 700 : 400}>
              {p.name}
            </Text>
          </UnstyledButton>
        ))}
      </SimpleGrid>
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        {COLOR_FIELDS.map((f) => (
          <ColorInput
            key={`${f.key}-${quiz.theme[f.key]}`}
            label={f.label}
            format="hex"
            disabled={locked}
            defaultValue={quiz.theme[f.key]}
            onChangeEnd={(v) => {
              if (v.toLowerCase() !== quiz.theme[f.key].toLowerCase()) {
                mutate("PATCH", path, { theme: { ...quiz.theme, [f.key]: v } });
              }
            }}
          />
        ))}
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <MediaField
          label="Фон по умолчанию"
          description="лучше 1920×1080, украшения по краям, центр спокойный"
          kind="image"
          value={quiz.background}
          disabled={locked}
          onChange={(f) => mutate("PATCH", path, { background_filename: f })}
        />
        <MediaField
          label="Музыка лобби"
          kind="audio"
          value={quiz.lobby_music}
          disabled={locked}
          onChange={(f) => mutate("PATCH", path, { lobby_music_filename: f })}
        />
      </SimpleGrid>
    </Stack>
  );
}

import { Box, Button, Checkbox, Group, Input, NumberInput, Select, SimpleGrid, Stack, TextInput } from "@mantine/core";
import type { RoundData } from "../lib/types";
import { confirmDialog } from "./dialogs";
import type { Mutate } from "./QuizEditor";
import { ROUND_KINDS } from "./roundKinds";
import { SectionLabel } from "./ui";

const DISCUSS_PRESETS = [30, 60];

const BUZZER_MODES = [
  { value: "instant", label: "сразу" },
  { value: "bar", label: "после полоски" },
];

/** Number input that saves on blur; remounts when the saved value changes from outside. */
function NumberField(props: { label?: string; value: number; min?: number; onSave: (v: number) => void }) {
  return (
    <NumberInput
      label={props.label}
      min={props.min ?? 0}
      key={props.value}
      defaultValue={props.value}
      onBlur={(e) => {
        const v = Number(e.currentTarget.value);
        if (Number.isFinite(v) && v !== props.value) props.onSave(v);
      }}
    />
  );
}

export default function RoundSettings({
  round,
  mutate,
  onDeleted,
}: {
  round: RoundData;
  mutate: Mutate;
  onDeleted: () => void;
}) {
  const patch = (body: Partial<RoundData>) => mutate("PATCH", `/api/rounds/${round.id}`, body);

  return (
    <Stack>
      <Box>
        <SectionLabel>Тур · {ROUND_KINDS[round.kind].title}</SectionLabel>
        <TextInput
          label="Название"
          key={round.title}
          defaultValue={round.title}
          onBlur={(e) => e.target.value !== round.title && patch({ title: e.target.value })}
        />
      </Box>

      {round.kind === "jeopardy" ? (
        <>
          <Checkbox
            label="Минус за неверный ответ"
            checked={round.minus_on_wrong}
            onChange={(e) => patch({ minus_on_wrong: e.currentTarget.checked })}
          />
          <SimpleGrid cols={2}>
            <Select
              label="Кнопка"
              data={BUZZER_MODES}
              allowDeselect={false}
              value={round.buzzer_mode}
              onChange={(v) => v && patch({ buzzer_mode: v as RoundData["buzzer_mode"] })}
            />
            {round.buzzer_mode === "bar" && (
              <NumberField label="Полоска, секунд" value={round.bar_seconds} onSave={(v) => patch({ bar_seconds: v })} />
            )}
          </SimpleGrid>
        </>
      ) : (
        <>
          <Input.Wrapper label="Обсуждение, секунд">
            <Group gap="xs" mt={4} mb={6}>
              {DISCUSS_PRESETS.map((p) => (
                <Button
                  key={p}
                  size="compact-sm"
                  variant={round.discuss_seconds === p ? "filled" : "default"}
                  onClick={() => patch({ discuss_seconds: p })}
                >
                  {p}
                </Button>
              ))}
            </Group>
            <NumberField value={round.discuss_seconds} onSave={(v) => patch({ discuss_seconds: v })} />
          </Input.Wrapper>
          <NumberField label="Ввод ответа, секунд" value={round.input_seconds} onSave={(v) => patch({ input_seconds: v })} />
          <Checkbox
            label="Ставки (верно ×2, неверно −1 номинал)"
            checked={round.stakes}
            onChange={(e) => patch({ stakes: e.currentTarget.checked })}
          />
        </>
      )}

      <Group>
        <Button
          color="red"
          variant="outline"
          onClick={async () => {
            const ok = await confirmDialog({
              title: `Удалить тур «${round.title}»?`,
              message: "Вместе с ним удалятся все его вопросы.",
              confirmLabel: "Удалить",
              danger: true,
            });
            if (!ok) return;
            if (await mutate("DELETE", `/api/rounds/${round.id}`)) onDeleted();
          }}
        >
          Удалить тур
        </Button>
      </Group>
    </Stack>
  );
}

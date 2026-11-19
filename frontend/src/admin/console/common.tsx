import { Button, Group, Paper, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { PanelProps } from "./types";

/** Question text with the host-only answer underneath. */
export function QuestionBox(props: { text: string; answer: ReactNode; children?: ReactNode }) {
  return (
    <Paper bg="gray.0" p="sm" lh={1.45} style={{ whiteSpace: "pre-wrap" }}>
      {props.text || (
        <Text span c="dimmed" inherit>
          (без текста)
        </Text>
      )}
      {props.children}
      <Text c="green.8" fw={600} mt="xs">
        Ответ: {props.answer}
      </Text>
    </Paper>
  );
}

/** Play / pause / restart for the question's audio on the hall screen. */
export function AudioControls({ send }: Pick<PanelProps, "send">) {
  return (
    <Group gap="xs">
      <Button variant="default" onClick={() => send({ type: "audio", action: "play" })}>
        ▶ Музыка
      </Button>
      <Button variant="default" onClick={() => send({ type: "audio", action: "pause" })}>
        ⏸
      </Button>
      <Button variant="default" onClick={() => send({ type: "audio", action: "restart" })}>
        ↺ С начала
      </Button>
    </Group>
  );
}

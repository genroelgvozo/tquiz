import { Button, Group, Paper, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { PanelProps } from "./types";

/**
 * Question text with the host-only answer underneath.
 * `typed`: how much of the text the screen has printed so far; the rest is dimmed.
 */
export function QuestionBox(props: { text: string; answer: ReactNode; typed?: number; children?: ReactNode }) {
  const { text, typed } = props;
  return (
    <Paper bg="gray.0" p="sm" lh={1.45} style={{ whiteSpace: "pre-wrap" }}>
      {!text ? (
        <Text span c="dimmed" inherit>
          (без текста)
        </Text>
      ) : typed === undefined ? (
        text
      ) : (
        <>
          {text.slice(0, typed)}
          <Text span c="dimmed" inherit>
            {text.slice(typed)}
          </Text>
        </>
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

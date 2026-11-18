/**
 * In-page dialogs for the admin. Never use window.confirm/prompt/alert here:
 * a native dialog makes the browser drop fullscreen on the hall screen window
 * when the host runs both on one computer.
 */
import { Button, Group, Radio, Stack, Text, TextInput } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useState, type ReactNode } from "react";
import type { RoundKind } from "../lib/types";
import { ROUND_KIND_LIST, ROUND_KINDS } from "./roundKinds";

let seq = 0;
const nextId = () => `tq-dialog-${++seq}`;

export function confirmDialog(opts: {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    modals.openConfirmModal({
      title: opts.title,
      children: opts.message ? <Text size="sm">{opts.message}</Text> : undefined,
      labels: { confirm: opts.confirmLabel ?? "Да", cancel: "Отмена" },
      confirmProps: opts.danger ? { color: "red" } : undefined,
      // onConfirm fires before the modal closes; onClose fires on every close — the first resolve wins
      onConfirm: () => resolve(true),
      onClose: () => resolve(false),
    });
  });
}

/** Asks for a non-empty line of text. Resolves to the trimmed value, or null when cancelled. */
export function promptDialog(opts: {
  title: string;
  label?: string;
  initial?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  const modalId = nextId();
  return new Promise((resolve) => {
    modals.open({
      modalId,
      title: opts.title,
      onClose: () => resolve(null),
      children: (
        <PromptForm
          label={opts.label}
          initial={opts.initial ?? ""}
          confirmLabel={opts.confirmLabel ?? "Сохранить"}
          onSubmit={(value) => {
            resolve(value);
            modals.close(modalId);
          }}
          onCancel={() => modals.close(modalId)}
        />
      ),
    });
  });
}

function PromptForm(props: {
  label?: string;
  initial: string;
  confirmLabel: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(props.initial);
  const trimmed = value.trim();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) props.onSubmit(trimmed);
      }}
    >
      <TextInput
        data-autofocus
        label={props.label}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        onFocus={(e) => e.currentTarget.select()}
      />
      <DialogButtons confirmLabel={props.confirmLabel} disabled={!trimmed} onCancel={props.onCancel} />
    </form>
  );
}

/** Round kind picker plus title in one step; lists every kind from ROUND_KINDS. */
export function newRoundDialog(): Promise<{ kind: RoundKind; title: string } | null> {
  const modalId = nextId();
  return new Promise((resolve) => {
    modals.open({
      modalId,
      title: "Новый тур",
      size: "lg",
      onClose: () => resolve(null),
      children: (
        <NewRoundForm
          onSubmit={(value) => {
            resolve(value);
            modals.close(modalId);
          }}
          onCancel={() => modals.close(modalId)}
        />
      ),
    });
  });
}

function NewRoundForm(props: {
  onSubmit: (value: { kind: RoundKind; title: string }) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<RoundKind>(ROUND_KIND_LIST[0]);
  const [title, setTitle] = useState(ROUND_KINDS[ROUND_KIND_LIST[0]].title);
  const trimmed = title.trim();

  const pickKind = (next: RoundKind) => {
    // keep a custom title, but follow the kind while the title is still a default one
    if (ROUND_KIND_LIST.some((k) => ROUND_KINDS[k].title === title)) setTitle(ROUND_KINDS[next].title);
    setKind(next);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) props.onSubmit({ kind, title: trimmed });
      }}
    >
      <Radio.Group value={kind} onChange={(v) => pickKind(v as RoundKind)} label="Тип тура" mb="md">
        <Stack gap="xs" mt={6}>
          {ROUND_KIND_LIST.map((k) => (
            <Radio.Card key={k} value={k} className="round-kind-card" radius="md" p="md">
              <Group wrap="nowrap" align="flex-start">
                <Radio.Indicator mt={2} />
                <div>
                  <Text fw={600}>{ROUND_KINDS[k].title}</Text>
                  <Text size="sm" c="dimmed">
                    {ROUND_KINDS[k].description}
                  </Text>
                </div>
              </Group>
            </Radio.Card>
          ))}
        </Stack>
      </Radio.Group>
      <TextInput label="Название тура" value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
      <DialogButtons confirmLabel="Создать" disabled={!trimmed} onCancel={props.onCancel} />
    </form>
  );
}

function DialogButtons(props: { confirmLabel: string; disabled: boolean; onCancel: () => void }) {
  return (
    <Group justify="flex-end" mt="lg">
      <Button variant="default" onClick={props.onCancel}>
        Отмена
      </Button>
      <Button type="submit" disabled={props.disabled}>
        {props.confirmLabel}
      </Button>
    </Group>
  );
}

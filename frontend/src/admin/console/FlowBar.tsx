import { ActionIcon, Badge, Box, Button, Group, Kbd, Menu, Text } from "@mantine/core";
import { useEffect, useRef } from "react";
import type { SocketStatus } from "../../lib/socket";
import { confirmDialog } from "../dialogs";
import { menuItems, stageTitle, stepButton, stepConfirm, type StepAction } from "./step";
import type { PanelProps } from "./types";
import { useConsoleHotkeys } from "./useConsoleHotkeys";

// After the stage changes (or a step click) the step button ignores clicks for a moment,
// so a double click on «Старт» does not also press «Начать тур».
const STEP_GUARD_MS = 1000;

interface Props extends PanelProps {
  status: SocketStatus;
  onCloseGame: () => void;
}

/** Game flow: stage title, undo with its label, the single step button and the rare jumps in «⋯». */
export default function FlowBar({ view, send, status, onCloseGame }: Props) {
  const st = view.state;
  const step = stepButton(view);
  const items = menuItems(view);
  const undoLabel = view.undo_label;
  const undoText = undoLabel ? `↶ Отменить: ${undoLabel}` : "↶ Отменить";

  const stageKey = `${st.stage}:${st.round_index}:${st.free?.phase ?? ""}`;
  const blockedUntil = useRef(0);
  useEffect(() => {
    blockedUntil.current = Date.now() + STEP_GUARD_MS;
  }, [stageKey]);

  const undo = () => send({ type: "undo" });
  useConsoleHotkeys([["mod+z", undoLabel === null ? null : undo]]);

  const run = async (action: StepAction) => {
    const spec = stepConfirm(view, action);
    if (spec && !(await confirmDialog(spec))) return;
    if (action === "close_game") onCloseGame();
    else send({ type: action });
  };
  const onStep = () => {
    if (Date.now() < blockedUntil.current) return;
    blockedUntil.current = Date.now() + STEP_GUARD_MS;
    void run(step.action);
  };

  return (
    <Group gap="xs" wrap="nowrap">
      {status !== "open" && <Badge color="yellow">нет связи…</Badge>}
      <Text fw={700} truncate flex={1} miw={0} title={stageTitle(view)}>
        {stageTitle(view)}
      </Text>
      <Button
        variant="default"
        maw={340}
        disabled={undoLabel === null}
        onClick={undo}
        title={undoText}
        rightSection={<Kbd size="xs">⌘Z</Kbd>}
      >
        <Text inherit truncate>
          {undoText}
        </Text>
      </Button>
      <Button miw={170} variant={step.highlighted ? "filled" : "default"} onClick={onStep}>
        {step.label}
      </Button>
      {items.length > 0 ? (
        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon variant="default" size="input-sm" aria-label="Ещё">
              ⋯
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {items.map((it) => (
              <Menu.Item key={it.action} onClick={() => void run(it.action)}>
                {it.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      ) : (
        <Box w={36} />
      )}
    </Group>
  );
}

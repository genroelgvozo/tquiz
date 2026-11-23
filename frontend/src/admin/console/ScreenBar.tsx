import { Badge, Button, Chip, Group, Modal, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { Qr } from "../../components/Qr";
import { api } from "../../lib/api";
import { SectionLabel } from "../ui";
import type { PanelProps } from "./types";
import { blurActive } from "./useConsoleHotkeys";

/** What is on the shared screen: open it, its QR, and the toggles (join QR, leaderboard, music). */
export default function ScreenBar({ view, send }: PanelProps) {
  const st = view.state;
  const [screenUrl, setScreenUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    api<{ url: string }>("GET", "/api/game/screen-link")
      .then((r) => setScreenUrl(r.url))
      .catch(() => {});
  }, []);

  // A clicked chip keeps focus on its checkbox, and Space would toggle it instead of the console hotkey.
  const toggle = (fn: () => void) => () => {
    blurActive();
    fn();
  };

  return (
    <Group gap="xs">
      <SectionLabel mb={0}>Экран</SectionLabel>
      <Button variant="default" size="xs" disabled={!screenUrl} onClick={() => screenUrl && window.open(screenUrl, "tquiz-screen")}>
        Открыть
      </Button>
      <Button variant="default" size="xs" disabled={!screenUrl} onClick={() => setShowQr(true)}>
        QR экрана
      </Button>
      <Chip size="sm" checked={st.qr_visible} onChange={toggle(() => send({ type: "show_qr", visible: !st.qr_visible }))}>
        QR входа
      </Chip>
      <Chip
        size="sm"
        checked={st.overlay === "leaderboard"}
        onChange={toggle(() => send({ type: "set_overlay", overlay: st.overlay === "leaderboard" ? null : "leaderboard" }))}
      >
        Рейтинг
      </Chip>
      <Chip
        size="sm"
        checked={st.music !== null && !st.music_paused}
        disabled={st.music === null}
        onChange={toggle(() => send({ type: "music_toggle" }))}
      >
        Музыка
      </Chip>
      {view.screen_sound === "off" && (
        <Badge color="red" ml="auto">
          Нет звука на экране — кликните по нему
        </Badge>
      )}

      <Modal opened={showQr && !!screenUrl} onClose={() => setShowQr(false)} title="Откройте ссылку на ТВ или проекторе">
        {screenUrl && (
          <Stack align="center">
            <Qr value={screenUrl} size={260} />
            <Text style={{ wordBreak: "break-all" }} ta="center">
              {screenUrl}
            </Text>
            <Button variant="default" onClick={() => setShowQr(false)}>
              Закрыть
            </Button>
          </Stack>
        )}
      </Modal>
    </Group>
  );
}

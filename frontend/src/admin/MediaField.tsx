import { Box, Button, FileButton, Group, Image, Input, Stack, Text } from "@mantine/core";
import { uploadMedia } from "../lib/api";
import type { MediaRef } from "../lib/types";
import { notifyApiError, notifyError } from "./notify";

/** Upload/clear control for one media file: small image preview or an audio player. */
export default function MediaField(props: {
  label: string;
  description?: string;
  kind: "image" | "audio";
  value: MediaRef | null;
  disabled: boolean;
  onChange: (filename: string | null) => void;
}) {
  const { kind, value, disabled } = props;

  const upload = async (file: File | null) => {
    if (!file) return;
    try {
      const media = await uploadMedia(file);
      if (media.kind !== kind) {
        notifyError(kind === "image" ? "Нужна картинка" : "Нужен аудиофайл");
        return;
      }
      props.onChange(media.filename);
    } catch (e) {
      notifyApiError(e, "Не удалось загрузить файл");
    }
  };

  return (
    <Input.Wrapper label={props.label} description={props.description}>
      <Stack gap="xs" mt={4}>
        {value && kind === "image" && <Image src={value.url} h={60} w="auto" fit="contain" alt="" />}
        {value && kind === "audio" && <Box component="audio" w="100%" controls src={value.url} />}
        <Group gap="xs">
          <FileButton accept={kind === "image" ? "image/*" : "audio/*"} onChange={upload} disabled={disabled}>
            {(p) => (
              <Button variant="default" size="compact-sm" {...p}>
                Загрузить
              </Button>
            )}
          </FileButton>
          {value ? (
            <Button variant="default" size="compact-sm" disabled={disabled} title="Убрать" onClick={() => props.onChange(null)}>
              ×
            </Button>
          ) : (
            <Text size="xs" c="dimmed">
              не задано
            </Text>
          )}
        </Group>
      </Stack>
    </Input.Wrapper>
  );
}

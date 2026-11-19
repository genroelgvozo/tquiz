import { Text, type MantineSpacing } from "@mantine/core";
import type { ReactNode } from "react";

/** Small uppercase caption above a block: «Туры», «Команды», «Вопрос». */
export function SectionLabel({ children, mb = "xs" }: { children: ReactNode; mb?: MantineSpacing | 0 }) {
  return (
    <Text size="xs" tt="uppercase" fw={600} c="dimmed" lts={0.4} mb={mb}>
      {children}
    </Text>
  );
}

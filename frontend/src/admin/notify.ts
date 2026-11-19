import { notifications } from "@mantine/notifications";
import { ApiError } from "../lib/api";

/** Error message in the bottom-right corner (replaces the old hand-made toast). */
export function notifyError(message: string) {
  notifications.show({ color: "red", message });
}

/** Shows the server's error detail, or the fallback text for anything else. */
export function notifyApiError(e: unknown, fallback: string) {
  notifyError(e instanceof ApiError ? e.detail : fallback);
}

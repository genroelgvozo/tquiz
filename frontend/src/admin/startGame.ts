import { api, ApiError } from "../lib/api";
import { confirmDialog } from "./dialogs";

/** Starts a game; asks before replacing a running one. Returns true when started. */
export async function startGame(quizId: number): Promise<boolean> {
  try {
    await api("POST", "/api/game/start", { quiz_id: quizId });
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const ok = await confirmDialog({
        title: "Уже идёт игра",
        message: "Завершить её и начать новую? Счёт текущей игры пропадёт.",
        confirmLabel: "Начать новую",
        danger: true,
      });
      if (!ok) return false;
      await api("POST", "/api/game/start", { quiz_id: quizId, force: true });
      return true;
    }
    throw err;
  }
}

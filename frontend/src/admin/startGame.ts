import { api, ApiError } from "../lib/api";

/** Starts a game; asks before replacing a running one. Returns true when started. */
export async function startGame(quizId: number): Promise<boolean> {
  try {
    await api("POST", "/api/game/start", { quiz_id: quizId });
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      if (!window.confirm("Уже идёт игра. Завершить её и начать новую?")) return false;
      await api("POST", "/api/game/start", { quiz_id: quizId, force: true });
      return true;
    }
    throw err;
  }
}

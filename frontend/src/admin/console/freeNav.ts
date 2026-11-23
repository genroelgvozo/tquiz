// When ←/→ in a free round needs a confirmation. Pure: tested with node:test.
import type { AdminView } from "../../lib/types";
import type { ConfirmSpec } from "./step";

/** `target` is the question index in the round (from 0). Going to it closes the current question
 * if its timer is still on, and restarts the timer of a question that was already open. */
export function freeNavConfirm(view: AdminView, target: number): ConfirmSpec | null {
  const free = view.state.free;
  const question = view.quiz.rounds[view.state.round_index]?.questions[target];
  if (!free || !question) return null;
  const reasons: string[] = [];
  if (free.timer.status === "running" || free.timer.status === "paused") reasons.push("Таймер ещё идёт — текущий вопрос закроется.");
  if (free.opened.includes(question.id))
    reasons.push(`Вопрос ${target + 1} уже был: таймер начнётся сначала, команды смогут поменять ответ.`);
  if (reasons.length === 0) return null;
  return { title: `Перейти к вопросу ${target + 1}?`, message: reasons.join(" "), confirmLabel: "Перейти", danger: true };
}

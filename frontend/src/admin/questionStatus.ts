// What an editor question still lacks. Pure: tested with node:test.
import type { QuestionData, RoundData } from "../lib/types";

/** Reasons the question is not filled in yet; empty when it is ready to play. */
export function missingParts(q: Pick<QuestionData, "text" | "answer" | "media" | "options" | "correct_option">): string[] {
  const reasons: string[] = [];
  if (!q.text.trim() && !q.media) reasons.push("нет текста");
  if (q.options.length > 0) {
    if (q.correct_option === null) reasons.push("не отмечен верный вариант");
  } else if (!q.answer.trim()) reasons.push("нет ответа");
  return reasons;
}

export function incompleteCount(round: RoundData): number {
  const questions = round.kind === "jeopardy" ? round.categories.flatMap((c) => c.questions) : round.questions;
  return questions.filter((q) => missingParts(q).length > 0).length;
}

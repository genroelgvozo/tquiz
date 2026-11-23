// Pure rules for the console's flow row: the step button, the "⋯" menu and their confirmations.
// No React or Mantine here: tests run these with node:test.
import type { AdminView, RoundData } from "../../lib/types";
import { ROUND_KINDS } from "../roundKinds.ts";
import { uncheckedCount } from "./check.ts";

export type StepAction = "start_game" | "start_round" | "next_round" | "start_review" | "finish_game" | "close_game";
export interface StepButton {
  action: StepAction;
  label: string;
  highlighted: boolean;
}
export interface MenuItem {
  action: StepAction;
  label: string;
}
/** Same shape as the confirmDialog argument. */
export interface ConfirmSpec {
  title: string;
  message?: string;
  confirmLabel: string;
  danger?: boolean;
}

function currentRound(view: AdminView): RoundData | undefined {
  return view.quiz.rounds[view.state.round_index];
}

function isLastRound(view: AdminView): boolean {
  return view.state.round_index + 1 >= view.quiz.rounds.length;
}

export function stageTitle(view: AdminView): string {
  const st = view.state;
  if (st.stage === "lobby") return `Лобби · ${view.quiz.title}`;
  if (st.stage === "finished") return "Игра окончена";
  const round = currentRound(view);
  const parts = [`Тур ${st.round_index + 1} из ${view.quiz.rounds.length}`];
  if (st.stage === "intro") parts.push("Заставка");
  else if (round) parts.push(ROUND_KINDS[round.kind].title);
  if (st.stage === "free" && st.free?.phase === "review") parts.push("Разбор");
  parts.push(round?.title || "Без названия");
  return parts.join(" · ");
}

/** A jeopardy round is unfinished while cells are left or a question is still open
 * (the cell enters `played` when it is opened). A free round is unfinished before
 * the review or while answers are unchecked. */
export function roundProgress(view: AdminView): { unchecked: number; unfinished: boolean } {
  const st = view.state;
  const round = currentRound(view);
  const unchecked = st.stage === "free" ? uncheckedCount(view) : 0;
  let unfinished = false;
  if (st.stage === "free") unfinished = st.free?.phase === "question" || unchecked > 0;
  else if (st.stage === "jeopardy" && round && st.jeopardy) {
    const cells = round.categories.reduce((n, c) => n + c.questions.length, 0);
    unfinished = st.jeopardy.played.length < cells || st.jeopardy.phase === "question" || st.jeopardy.phase === "secret";
  }
  return { unchecked, unfinished };
}

function freeTotal(view: AdminView): number {
  return currentRound(view)?.questions.length ?? 0;
}

function nextOrFinish(view: AdminView, highlighted: boolean): StepButton {
  return isLastRound(view)
    ? { action: "finish_game", label: "Завершить игру", highlighted }
    : { action: "next_round", label: "След. тур →", highlighted };
}

export function stepButton(view: AdminView): StepButton {
  const st = view.state;
  switch (st.stage) {
    case "lobby":
      return { action: "start_game", label: "Старт", highlighted: true };
    case "intro":
      return { action: "start_round", label: "Начать тур", highlighted: true };
    case "jeopardy":
      return nextOrFinish(view, !roundProgress(view).unfinished);
    case "free": {
      const free = st.free;
      const last = freeTotal(view) - 1;
      if (free?.phase === "review") return nextOrFinish(view, free.review_index === last && free.answer_shown);
      return { action: "start_review", label: "Начать разбор", highlighted: !!free && free.index === last && free.timer.status === "finished" };
    }
    case "finished":
      return { action: "close_game", label: "Закрыть игру", highlighted: true };
  }
}

export function menuItems(view: AdminView): MenuItem[] {
  const st = view.state;
  if (st.stage === "lobby") return [{ action: "close_game", label: "Закрыть игру" }];
  if (st.stage === "finished") return [];
  const items: MenuItem[] = [];
  if (!isLastRound(view)) {
    if (st.stage === "intro") items.push({ action: "next_round", label: "Пропустить тур" });
    if (st.stage === "free" && st.free?.phase === "question") items.push({ action: "next_round", label: "След. тур без разбора" });
  }
  if (stepButton(view).action !== "finish_game") items.push({ action: "finish_game", label: "Завершить игру" });
  return items;
}

function unfinishedMessage(unchecked: number, question: string): string {
  return "Есть неразобранные ответы или несыгранные вопросы." + (unchecked > 0 ? ` Не проверено ответов: ${unchecked}.` : "") + " " + question;
}

export function stepConfirm(view: AdminView, action: StepAction): ConfirmSpec | null {
  const st = view.state;
  switch (action) {
    case "start_game":
    case "start_round":
      return null;
    case "next_round": {
      if (st.stage === "intro") return null;
      const { unchecked, unfinished } = roundProgress(view);
      return unfinished
        ? {
            title: "Тур не закончен",
            message: unfinishedMessage(unchecked, "Перейти к следующему туру? Вернуться будет нельзя."),
            confirmLabel: "Перейти",
            danger: true,
          }
        : { title: "Перейти к следующему туру?", confirmLabel: "Перейти" };
    }
    case "finish_game": {
      const { unchecked, unfinished } = roundProgress(view);
      return st.stage === "free" && unfinished
        ? {
            title: "Тур не закончен",
            message: unfinishedMessage(unchecked, "Завершить игру и показать победителя?"),
            confirmLabel: "Завершить",
            danger: true,
          }
        : { title: "Завершить игру и показать победителя?", confirmLabel: "Завершить" };
    }
    case "start_review": {
      const free = st.free;
      if (!free) return null;
      const t = free.timer.status;
      const early = free.index < freeTotal(view) - 1 || (t !== "finished" && t !== "idle");
      return early ? { title: "Начать разбор?", message: "Вернуться к вопросам этого тура будет нельзя.", confirmLabel: "Начать разбор" } : null;
    }
    case "close_game":
      return { title: "Закрыть игру?", message: "Экран и телефоны вернутся в ожидание.", confirmLabel: "Закрыть игру", danger: true };
  }
}

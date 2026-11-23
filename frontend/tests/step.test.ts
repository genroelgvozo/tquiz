import { test } from "node:test";
import assert from "node:assert/strict";
import type { AdminView, RoundKind, TimerStatus } from "../src/lib/types.ts";
import { menuItems, roundProgress, stageTitle, stepButton, stepConfirm } from "../src/admin/console/step.ts";

const TITLES = ["Разминка", "Литература", "Финал"];

function round(kind: RoundKind, i: number) {
  if (kind === "jeopardy") {
    const qs = (base: number) => [1, 2, 3].map((n) => ({ id: base + n }));
    return { kind, title: TITLES[i], categories: [{ questions: qs(i * 10) }, { questions: qs(i * 10 + 3) }], questions: [] };
  }
  return { kind, title: TITLES[i], categories: [], questions: [1, 2, 3].map((n) => ({ id: i * 10 + n })) };
}

interface Opts {
  stage: AdminView["state"]["stage"];
  round_index?: number;
  kinds?: RoundKind[];
  jeopardy?: { phase: string; played: number[] };
  free?: Partial<{
    phase: "question" | "review";
    index: number;
    timer: TimerStatus;
    review_index: number;
    answer_shown: boolean;
    unchecked: number;
  }>;
}

function view(o: Opts): AdminView {
  const kinds = o.kinds ?? ["jeopardy", "free", "jeopardy"];
  const f = o.free;
  const answers: Record<string, Record<string, { text: string; option: null; stake: boolean }>> = {};
  for (let i = 0; i < (f?.unchecked ?? 0); i++) answers[String(11 + i)] = { a: { text: "x", option: null, stake: false } };
  return {
    quiz: { title: "Демо-квиз", rounds: kinds.map(round) },
    state: {
      stage: o.stage,
      round_index: o.round_index ?? -1,
      teams: [{ id: "a" }],
      jeopardy: o.jeopardy ?? null,
      free: f
        ? {
            phase: f.phase ?? "question",
            index: f.index ?? 0,
            timer: { status: f.timer ?? "idle" },
            review_index: f.review_index ?? 0,
            answer_shown: f.answer_shown ?? false,
            answers,
            marks: {},
            opened: Object.keys(answers).map(Number),
          }
        : null,
    },
  } as unknown as AdminView;
}

const ALL_J = [1, 2, 3, 4, 5, 6];
const jView = (phase: string, played: number[], round_index = 0) => view({ stage: "jeopardy", round_index, jeopardy: { phase, played } });
const fView = (free: Opts["free"], round_index = 1, kinds?: RoundKind[]) => view({ stage: "free", round_index, free, kinds });

test("lobby: Старт, highlighted, menu has close_game", () => {
  const v = view({ stage: "lobby" });
  assert.deepEqual(stepButton(v), { action: "start_game", label: "Старт", highlighted: true });
  assert.deepEqual(menuItems(v), [{ action: "close_game", label: "Закрыть игру" }]);
  assert.equal(stageTitle(v), "Лобби · Демо-квиз");
});

test("intro: Начать тур; menu: Пропустить тур + Завершить игру; last round menu has only Завершить игру", () => {
  const v = view({ stage: "intro", round_index: 0 });
  assert.deepEqual(stepButton(v), { action: "start_round", label: "Начать тур", highlighted: true });
  assert.deepEqual(menuItems(v), [
    { action: "next_round", label: "Пропустить тур" },
    { action: "finish_game", label: "Завершить игру" },
  ]);
  assert.equal(stageTitle(v), "Тур 1 из 3 · Заставка · Разминка");
  assert.deepEqual(menuItems(view({ stage: "intro", round_index: 2 })), [{ action: "finish_game", label: "Завершить игру" }]);
});

test("round without a title is called Без названия", () => {
  const v = view({ stage: "intro", round_index: 0 });
  v.quiz.rounds[0].title = "";
  assert.equal(stageTitle(v), "Тур 1 из 3 · Заставка · Без названия");
});

test("jeopardy mid-round: След. тур →, not highlighted; menu: Завершить игру", () => {
  const v = jView("board", [1, 2]);
  assert.deepEqual(stepButton(v), { action: "next_round", label: "След. тур →", highlighted: false });
  assert.deepEqual(menuItems(v), [{ action: "finish_game", label: "Завершить игру" }]);
  assert.equal(stageTitle(v), "Тур 1 из 3 · Своя игра · Разминка");
  assert.equal(roundProgress(v).unfinished, true);
});

test("jeopardy all played but last question open (phase question or secret): not highlighted, unfinished", () => {
  for (const phase of ["question", "secret"]) {
    const v = jView(phase, ALL_J);
    assert.equal(stepButton(v).highlighted, false, phase);
    assert.equal(roundProgress(v).unfinished, true, phase);
  }
});

test("jeopardy all played, phase board or answer: highlighted, finished", () => {
  for (const phase of ["board", "answer"]) {
    const v = jView(phase, ALL_J);
    assert.equal(stepButton(v).highlighted, true, phase);
    assert.equal(roundProgress(v).unfinished, false, phase);
  }
});

test("jeopardy in last round: Завершить игру", () => {
  const v = jView("board", [21], 2);
  assert.deepEqual(stepButton(v), { action: "finish_game", label: "Завершить игру", highlighted: false });
  assert.deepEqual(menuItems(v), []);
});

test("free questions: Начать разбор highlighted only on last question with finished timer", () => {
  assert.deepEqual(stepButton(fView({ index: 2, timer: "finished" })), { action: "start_review", label: "Начать разбор", highlighted: true });
  assert.equal(stepButton(fView({ index: 2, timer: "idle" })).highlighted, false);
  assert.equal(stepButton(fView({ index: 1, timer: "finished" })).highlighted, false);
  assert.deepEqual(menuItems(fView({ index: 0 })), [
    { action: "next_round", label: "След. тур без разбора" },
    { action: "finish_game", label: "Завершить игру" },
  ]);
});

test("free questions in last round: menu has only Завершить игру", () => {
  const v = fView({ index: 0 }, 2, ["jeopardy", "jeopardy", "free"]);
  assert.equal(stepButton(v).action, "start_review");
  assert.deepEqual(menuItems(v), [{ action: "finish_game", label: "Завершить игру" }]);
});

test("free review: След. тур → highlighted when last question answer shown", () => {
  const done = fView({ phase: "review", review_index: 2, answer_shown: true });
  assert.deepEqual(stepButton(done), { action: "next_round", label: "След. тур →", highlighted: true });
  assert.equal(stepButton(fView({ phase: "review", review_index: 1, answer_shown: true })).highlighted, false);
  assert.equal(stepButton(fView({ phase: "review", review_index: 2, answer_shown: false })).highlighted, false);
  assert.deepEqual(menuItems(done), [{ action: "finish_game", label: "Завершить игру" }]);
  assert.equal(stageTitle(done), "Тур 2 из 3 · Свободный ввод · Разбор · Литература");

  const last = fView({ phase: "review", review_index: 2, answer_shown: true }, 2, ["jeopardy", "jeopardy", "free"]);
  assert.deepEqual(stepButton(last), { action: "finish_game", label: "Завершить игру", highlighted: true });
  assert.deepEqual(menuItems(last), []);
});

test("free questions title has no Разбор", () => {
  assert.equal(stageTitle(fView({ index: 0 })), "Тур 2 из 3 · Свободный ввод · Литература");
});

test("finished: Закрыть игру highlighted, empty menu; title Игра окончена", () => {
  const v = view({ stage: "finished", round_index: 2 });
  assert.deepEqual(stepButton(v), { action: "close_game", label: "Закрыть игру", highlighted: true });
  assert.deepEqual(menuItems(v), []);
  assert.equal(stageTitle(v), "Игра окончена");
});

test("stepConfirm: next_round from intro is null", () => {
  assert.equal(stepConfirm(view({ stage: "intro", round_index: 0 }), "next_round"), null);
});

test("stepConfirm: next_round unfinished free round lists unchecked count", () => {
  const v = fView({ phase: "review", review_index: 2, answer_shown: true, unchecked: 2 });
  assert.deepEqual(roundProgress(v), { unchecked: 2, unfinished: true });
  assert.deepEqual(stepConfirm(v, "next_round"), {
    title: "Тур не закончен",
    message: "Есть неразобранные ответы или несыгранные вопросы. Не проверено ответов: 2. Перейти к следующему туру? Вернуться будет нельзя.",
    confirmLabel: "Перейти",
    danger: true,
  });
  assert.equal(
    stepConfirm(fView({ index: 0 }), "next_round")?.message,
    "Есть неразобранные ответы или несыгранные вопросы. Перейти к следующему туру? Вернуться будет нельзя.",
  );
});

test("stepConfirm: next_round finished round asks plainly", () => {
  const plain = { title: "Перейти к следующему туру?", confirmLabel: "Перейти" };
  assert.deepEqual(stepConfirm(jView("answer", ALL_J), "next_round"), plain);
  assert.deepEqual(stepConfirm(fView({ phase: "review", review_index: 2, answer_shown: true }), "next_round"), plain);
});

test("stepConfirm: finish_game warns only for unfinished free round", () => {
  assert.deepEqual(stepConfirm(fView({ phase: "review", unchecked: 1 }), "finish_game"), {
    title: "Тур не закончен",
    message: "Есть неразобранные ответы или несыгранные вопросы. Не проверено ответов: 1. Завершить игру и показать победителя?",
    confirmLabel: "Завершить",
    danger: true,
  });
  assert.equal(
    stepConfirm(fView({ index: 0 }), "finish_game")?.message,
    "Есть неразобранные ответы или несыгранные вопросы. Завершить игру и показать победителя?",
  );
  const plain = { title: "Завершить игру и показать победителя?", confirmLabel: "Завершить" };
  assert.deepEqual(stepConfirm(jView("board", [1], 2), "finish_game"), plain);
  assert.deepEqual(stepConfirm(view({ stage: "intro", round_index: 0 }), "finish_game"), plain);
});

test("stepConfirm: start_review early vs on time", () => {
  const early = { title: "Начать разбор?", message: "Вернуться к вопросам этого тура будет нельзя.", confirmLabel: "Начать разбор" };
  assert.deepEqual(stepConfirm(fView({ index: 1, timer: "finished" }), "start_review"), early);
  assert.deepEqual(stepConfirm(fView({ index: 2, timer: "running" }), "start_review"), early);
  assert.deepEqual(stepConfirm(fView({ index: 2, timer: "paused" }), "start_review"), early);
  assert.equal(stepConfirm(fView({ index: 2, timer: "finished" }), "start_review"), null);
  assert.equal(stepConfirm(fView({ index: 2, timer: "idle" }), "start_review"), null);
});

test("stepConfirm: close_game", () => {
  assert.deepEqual(stepConfirm(view({ stage: "lobby" }), "close_game"), {
    title: "Закрыть игру?",
    message: "Экран и телефоны вернутся в ожидание.",
    confirmLabel: "Закрыть игру",
    danger: true,
  });
});

test("stepConfirm: start_game and start_round are null", () => {
  assert.equal(stepConfirm(view({ stage: "lobby" }), "start_game"), null);
  assert.equal(stepConfirm(view({ stage: "intro", round_index: 0 }), "start_round"), null);
});

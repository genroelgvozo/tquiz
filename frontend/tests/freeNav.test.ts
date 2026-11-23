import { test } from "node:test";
import assert from "node:assert/strict";
import type { AdminView, TimerStatus } from "../src/lib/types.ts";
import { freeNavConfirm } from "../src/admin/console/freeNav.ts";

function view(index: number, status: TimerStatus, opened: number[]): AdminView {
  return {
    quiz: { rounds: [{ kind: "free", questions: [31, 32, 33, 34].map((id) => ({ id })) }] },
    state: { round_index: 0, free: { phase: "question", index, timer: { status }, opened } },
  } as unknown as AdminView;
}

const RUNNING = "Таймер ещё идёт — текущий вопрос закроется.";
const OPENED = "Вопрос 2 уже был: таймер начнётся сначала, команды смогут поменять ответ.";

test("timer finished, new question: no confirm", () => {
  assert.equal(freeNavConfirm(view(0, "finished", [31]), 1), null);
});

test("timer idle, new question: no confirm", () => {
  assert.equal(freeNavConfirm(view(0, "idle", [31]), 1), null);
});

test("timer running: confirm", () => {
  assert.deepEqual(freeNavConfirm(view(0, "running", [31]), 1), {
    title: "Перейти к вопросу 2?",
    message: RUNNING,
    confirmLabel: "Перейти",
    danger: true,
  });
});

test("timer paused counts as running", () => {
  assert.equal(freeNavConfirm(view(0, "paused", [31]), 1)?.message, RUNNING);
});

test("already opened question: confirm", () => {
  assert.deepEqual(freeNavConfirm(view(2, "finished", [31, 32, 33]), 1), {
    title: "Перейти к вопросу 2?",
    message: OPENED,
    confirmLabel: "Перейти",
    danger: true,
  });
});

test("both reasons: one dialog with both sentences", () => {
  assert.equal(freeNavConfirm(view(2, "running", [31, 32, 33]), 1)?.message, `${RUNNING} ${OPENED}`);
});

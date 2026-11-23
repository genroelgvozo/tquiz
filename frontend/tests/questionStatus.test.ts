import { test } from "node:test";
import assert from "node:assert/strict";
import type { QuestionData, RoundData } from "../src/lib/types.ts";
import { incompleteCount, missingParts } from "../src/admin/questionStatus.ts";

const AUDIO = { filename: "a.mp3", kind: "audio" as const, url: "/media/a.mp3" };
const q = (over: Partial<QuestionData> = {}) => ({ text: "Q", answer: "A", media: null, options: [], correct_option: null, ...over });

test("filled question is complete", () => {
  assert.deepEqual(missingParts(q()), []);
});

test("no text and no media", () => {
  assert.deepEqual(missingParts(q({ text: "  " })), ["нет текста"]);
});

test("media without text is fine", () => {
  assert.deepEqual(missingParts(q({ text: "", media: AUDIO })), []);
});

test("empty answer", () => {
  assert.deepEqual(missingParts(q({ answer: " " })), ["нет ответа"]);
});

test("options without correct one", () => {
  assert.deepEqual(missingParts(q({ options: ["x", "y"], correct_option: null, answer: "" })), ["не отмечен верный вариант"]);
});

test("options with correct one need no text answer", () => {
  assert.deepEqual(missingParts(q({ options: ["x", "y"], correct_option: 1, answer: "" })), []);
});

test("several reasons are all listed", () => {
  assert.deepEqual(missingParts(q({ text: "", answer: "" })), ["нет текста", "нет ответа"]);
});

test("incompleteCount counts jeopardy categories and free questions", () => {
  const jeopardy = {
    kind: "jeopardy",
    categories: [{ questions: [q(), q({ answer: "" })] }, { questions: [q({ text: "" }), q()] }],
    questions: [],
  } as unknown as RoundData;
  assert.equal(incompleteCount(jeopardy), 2);
  const free = { kind: "free", categories: [], questions: [q(), q({ options: ["x"] }), q({ answer: "" })] } as unknown as RoundData;
  assert.equal(incompleteCount(free), 2);
});

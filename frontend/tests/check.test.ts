import { test } from "node:test";
import assert from "node:assert/strict";
import type { AdminView } from "../src/lib/types.ts";
import { uncheckedCount } from "../src/admin/console/check.ts";

type Marks = Record<string, Record<string, boolean | null>>;
type Answers = Record<string, Record<string, { text: string; option: number | null; stake: boolean }>>;

function view(free: { answers: Answers; marks: Marks; opened: number[] } | null): AdminView {
  return { state: { free } } as unknown as AdminView;
}
const ans = (text: string) => ({ text, option: null, stake: false });

test("answered with null mark is counted", () => {
  assert.equal(uncheckedCount(view({ answers: { "1": { a: ans("x") } }, marks: { "1": { a: null } }, opened: [1] })), 1);
});

test("answered with true or false mark is not counted", () => {
  const v = view({ answers: { "1": { a: ans("x"), b: ans("y") } }, marks: { "1": { a: true, b: false } }, opened: [1] });
  assert.equal(uncheckedCount(v), 0);
});

test("answered with missing mark key is counted", () => {
  assert.equal(uncheckedCount(view({ answers: { "1": { a: ans("x") } }, marks: {}, opened: [1] })), 1);
});

test("no answer is not counted", () => {
  const v = view({ answers: { "1": { a: ans("  "), b: { text: "", option: null, stake: true } } }, marks: { "1": {} }, opened: [1] });
  assert.equal(uncheckedCount(v), 0);
});

test("option answer counts as answered", () => {
  const v = view({ answers: { "1": { a: { text: "", option: 0, stake: false } } }, marks: {}, opened: [1] });
  assert.equal(uncheckedCount(v), 1);
});

test("questions not opened are not counted", () => {
  assert.equal(uncheckedCount(view({ answers: { "1": { a: ans("x") }, "2": { a: ans("y") } }, marks: {}, opened: [2] })), 1);
});

test("returns 0 when free is null", () => {
  assert.equal(uncheckedCount(view(null)), 0);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutBoard } from "../src/lib/board.ts";

const c = (value: number) => ({ value });
const vals = (row: ({ value: number } | null)[]) => row.map((x) => x?.value ?? null);

test("gap keeps value column", () => {
  const r = layoutBoard([[c(100), c(200), c(300)], [c(100), c(300)]]);
  assert.deepEqual(r.columns, [100, 200, 300]);
  assert.deepEqual(vals(r.rows[1]), [100, null, 300]);
});
test("unsorted input is ordered by value", () => {
  const r = layoutBoard([[c(300), c(100)]]);
  assert.deepEqual(r.columns, [100, 300]);
  assert.deepEqual(vals(r.rows[0]), [100, 300]);
});
test("duplicates get extra columns", () => {
  const r = layoutBoard([[c(100), c(100)], [c(100)]]);
  assert.deepEqual(r.columns, [100, 100]);
  assert.deepEqual(vals(r.rows[1]), [100, null]);
});
test("empty board", () => {
  const r = layoutBoard([[], []]);
  assert.deepEqual(r.columns, []);
  assert.deepEqual(r.rows, [[], []]);
});

test("o-th question of a value goes to the o-th column of that value", () => {
  const r = layoutBoard([
    [{ value: 100, id: "a" }, { value: 100, id: "b" }],
    [{ value: 100, id: "c" }],
  ]);
  assert.deepEqual(r.rows[0].map((x) => x?.id ?? null), ["a", "b"]);
  assert.deepEqual(r.rows[1].map((x) => x?.id ?? null), ["c", null]);
});
test("gap and duplicates together", () => {
  const r = layoutBoard([[c(100), c(100), c(200)], [c(200)]]);
  assert.deepEqual(r.columns, [100, 100, 200]);
  assert.deepEqual(vals(r.rows[1]), [null, null, 200]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCellValues, parseCellValues } from "../src/admin/cellValues.ts";

test("parseCellValues sorts, dedups and accepts mixed separators", () => {
  assert.deepEqual(parseCellValues("300, 100 200;100"), [100, 200, 300]);
  assert.deepEqual(parseCellValues(" -50 50 "), [-50, 50]);
});

test("parseCellValues rejects empty and non-integer input", () => {
  assert.equal(parseCellValues(""), null);
  assert.equal(parseCellValues("100 abc"), null);
  assert.equal(parseCellValues("100.5"), null);
});

test("formatCellValues joins with spaces", () => {
  assert.equal(formatCellValues([100, 200]), "100 200");
});

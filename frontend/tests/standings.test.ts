import { test } from "node:test";
import assert from "node:assert/strict";
import type { Standings } from "../src/lib/types.ts";
import { leadersAndRanks } from "../src/lib/standings.ts";

function st(totals: number[], closed = true): Standings {
  return {
    columns: [{ index: 0, title: "t", closed }],
    rows: totals.map((total, i) => ({ team_id: `t${i}`, name: `T${i}`, rounds: [total], total })),
  };
}

test("tie at the top: two leaders, ranks 1,1,3", () => {
  assert.deepEqual(leadersAndRanks(st([10, 10, 5])), { leaders: ["t0", "t1"], ranks: [1, 1, 3] });
});

test("tie in the middle: ranks 1,2,2,4", () => {
  assert.deepEqual(leadersAndRanks(st([10, 7, 7, 1])), { leaders: ["t0"], ranks: [1, 2, 2, 4] });
});

test("single leader", () => {
  assert.deepEqual(leadersAndRanks(st([3, 2])), { leaders: ["t0"], ranks: [1, 2] });
});

test("empty rows", () => {
  assert.deepEqual(leadersAndRanks(st([])), { leaders: [], ranks: [] });
});

test("no closed rounds: no leaders", () => {
  assert.deepEqual(leadersAndRanks(st([0, 0], false)), { leaders: [], ranks: [1, 1] });
});

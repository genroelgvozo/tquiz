import { test } from "node:test";
import assert from "node:assert/strict";
import { typedChars } from "../src/lib/typing.ts";

test("typedChars", () => {
  assert.equal(typedChars(null, 100, 42), 42);
  assert.equal(typedChars({ base: 0, since: 10, speed: 15 }, 12, 100), 30);
  assert.equal(typedChars({ base: 20.7, since: null, speed: 15 }, 999, 100), 20);
  assert.equal(typedChars({ base: 0, since: 10, speed: 15 }, 9, 100), 0);
  assert.equal(typedChars({ base: 90, since: 10, speed: 15 }, 20, 100), 100);
});

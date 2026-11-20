import { test } from "node:test";
import assert from "node:assert/strict";
import { caretOf, typedChars } from "../src/lib/typing.ts";

test("typedChars", () => {
  assert.equal(typedChars(null, 100, 42), 42);
  assert.equal(typedChars({ base: 0, since: 10, speed: 15 }, 12, 100), 30);
  assert.equal(typedChars({ base: 20.7, since: null, speed: 15 }, 999, 100), 20);
  assert.equal(typedChars({ base: 0, since: 10, speed: 15 }, 9, 100), 0);
  assert.equal(typedChars({ base: 90, since: 10, speed: 15 }, 20, 100), 100);
});

test("caretOf", () => {
  assert.equal(caretOf(null, 42, 42), "none"); // no printing: the whole text, no caret
  assert.equal(caretOf({ base: 0, since: 10, speed: 15 }, 30, 100), "blink"); // printing
  assert.equal(caretOf({ base: 0, since: 10, speed: 15 }, 0, 100), "blink"); // printing has just started
  assert.equal(caretOf({ base: 20.7, since: null, speed: 15 }, 20, 100), "still"); // a buzz stopped it
  assert.equal(caretOf({ base: 0.4, since: null, speed: 15 }, 0, 100), "still"); // stopped before the first letter
  // the cell is still expanding: nothing printed yet, no caret
  assert.equal(caretOf({ base: 0, since: null, speed: 15 }, 0, 100), "none");
  assert.equal(caretOf({ base: 90, since: 10, speed: 15 }, 100, 100), "none"); // all printed
  assert.equal(caretOf({ base: 100, since: null, speed: 15 }, 100, 100), "none");
});

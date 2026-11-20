import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THEME, THEME_PRESETS, mix, onAccent, presetOf, themeVars } from "../src/lib/theme.ts";

test("theme helpers", () => {
  assert.equal(mix("#000000", "#ffffff", 0.5), "#808080");
  assert.equal(onAccent("#E2552F", "#FBF5EA"), "#ffffff");
  assert.equal(onAccent("#FF8A5B", "#16192B"), "#16192B");
  assert.equal(themeVars(DEFAULT_THEME)["--on-accent"], "#ffffff");
  assert.deepEqual(
    Object.keys(themeVars(DEFAULT_THEME)).sort(),
    ["--bg", "--text", "--accent", "--second", "--surface", "--muted", "--line", "--accent-dim", "--second-dim", "--on-accent", "--shadow"].sort(),
  );
  assert.equal(presetOf({ bg: "#16192b", text: "#F3F1EA", accent: "#FF8A5B", second: "#5CC8C2" }), "night");
  assert.equal(presetOf({ ...DEFAULT_THEME, accent: "#000000" }), null);
  assert.equal(THEME_PRESETS.length, 4);
});

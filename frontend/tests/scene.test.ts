import { test } from "node:test";
import assert from "node:assert/strict";
import type { RoundPublic, ScreenFree, ScreenJeopardy, ScreenQuestion, ScreenView } from "../src/lib/types.ts";
import { planTransition, sceneOf, type Scene } from "../src/screen/scene.ts";
import { BLINK_MS, REVEAL_MS, TITLE_TOTAL_MS, ZOOM_TOTAL_MS } from "../src/screen/motion.ts";

type Overrides = Partial<Omit<ScreenView, "jeopardy" | "free">> & {
  jeopardy?: Partial<ScreenJeopardy>;
  free?: Partial<ScreenFree>;
};

const question: ScreenQuestion = { title: "Кино · 300", text: "?", media: null, options: [], answer: null, highlight_option: null };
const round = (index: number): RoundPublic => ({ index, title: `Тур ${index + 1}`, kind: "jeopardy", total: 3 });

/** A minimal screen snapshot; `jeopardy` and `free` are filled with defaults when given partially. */
function view(o: Overrides = {}): ScreenView {
  const { jeopardy, free, ...rest } = o;
  return {
    kind: "screen",
    now: 0,
    quiz_title: "Квиз",
    logo_url: null,
    theme: { bg: "#FBF5EA", text: "#2B2420", accent: "#E2552F", second: "#2F7FA8" },
    background_url: null,
    quiz_background_url: null,
    stage: "lobby",
    join_url: "http://x/play",
    qr_visible: false,
    teams: [],
    round: round(0),
    overlay: null,
    audio: { action: "stop", seq: 0 },
    music: null,
    preload: [],
    standings: { columns: [], rows: [] },
    jeopardy: jeopardy
      ? {
          phase: "board",
          board: [],
          chooser_team_id: null,
          answering_team_id: null,
          buttons: "closed",
          bar_ends_at: null,
          bar_seconds: 5,
          question_id: null,
          question: null,
          typing: null,
          scores: {},
          ...jeopardy,
        }
      : null,
    free: free
      ? {
          phase: "question",
          number: 1,
          total: 5,
          timer: { status: "idle", total_seconds: 60, input_seconds: 20, deadline: null, remaining: null },
          question,
          ...free,
        }
      : null,
    ...rest,
  };
}

const board = sceneOf(view({ stage: "jeopardy", jeopardy: { phase: "board" } }));
const jq = (id: number, phase: "question" | "answer" = "question") =>
  sceneOf(view({ stage: "jeopardy", jeopardy: { phase, question_id: id, question } }));
const jq5 = jq(5);
const jq7 = jq(7);
const secret7 = sceneOf(view({ stage: "jeopardy", jeopardy: { phase: "secret", question_id: 7, question } }));
const free1 = sceneOf(view({ stage: "free", round: round(1), free: { phase: "question", number: 1 } }));
const review = sceneOf(view({ stage: "free", round: round(1), free: { phase: "review", number: 1 } }));

test("sceneOf: one scene per screen state", () => {
  assert.deepEqual(sceneOf(null), { kind: "blank", key: "blank" });
  assert.deepEqual(sceneOf(view({ stage: "lobby" })), { kind: "lobby", key: "lobby" });
  assert.deepEqual(sceneOf(view({ stage: "intro" })), { kind: "intro", key: "intro:0" });
  assert.deepEqual(board, { kind: "board", key: "board:0" });
  assert.deepEqual(secret7, { kind: "secret", key: "secret:7", questionId: 7 });
  assert.deepEqual(jq7, { kind: "jq", key: "jq:7", questionId: 7 });
  assert.deepEqual(jq(7, "answer"), jq7); // question and its answer are one scene
  assert.deepEqual(sceneOf(view({ stage: "free", round: round(1), free: { number: 3 } })), {
    kind: "free",
    key: "free:1:3",
    number: 3,
  });
  assert.deepEqual(sceneOf(view({ stage: "free", round: round(1), free: { phase: "review", number: 2 } })), {
    kind: "review",
    key: "review:1",
    number: 2,
  });
  assert.deepEqual(sceneOf(view({ stage: "finished" })), { kind: "winner", key: "winner" });
});

test("sceneOf: review keeps its key while the number changes", () => {
  assert.equal(
    sceneOf(view({ stage: "free", free: { phase: "review", number: 2 } })).key,
    sceneOf(view({ stage: "free", free: { phase: "review", number: 3 } })).key,
  );
});

test("sceneOf: incomplete snapshots fall back to safe scenes", () => {
  assert.equal(sceneOf(view({ stage: "intro", round: null })).kind, "blank");
  assert.equal(sceneOf(view({ stage: "jeopardy" })).kind, "blank");
  assert.equal(sceneOf(view({ stage: "free" })).kind, "blank");
  // question phase without a question in the snapshot is drawn as the board
  assert.equal(sceneOf(view({ stage: "jeopardy", jeopardy: { phase: "question", question_id: 7 } })).kind, "board");
});

test("planTransition", () => {
  assert.deepEqual(planTransition(null, board), { entrance: "none", holdMs: 0 });
  assert.deepEqual(planTransition(board, jq7), { entrance: "zoom", holdMs: 4 * BLINK_MS });
  assert.deepEqual(planTransition(jq5, jq7), { entrance: "title", holdMs: 0 }); // answer → straight to the next cell
  assert.deepEqual(planTransition(secret7, jq7), { entrance: "fade", holdMs: 0 });
  assert.deepEqual(planTransition(board, board), { entrance: "none", holdMs: 0 }); // interrupted: board again during the blink
  assert.deepEqual(planTransition(jq7, board), { entrance: "fade", holdMs: 0 });
  assert.deepEqual(planTransition(board, secret7), { entrance: "fade", holdMs: 0 });
  assert.deepEqual(planTransition(board, free1), { entrance: "title", holdMs: 0 });
  assert.deepEqual(planTransition(free1, review), { entrance: "title", holdMs: 0 });
  const review3: Scene = { kind: "review", key: review.key, number: 3 };
  assert.deepEqual(planTransition(review, review3), { entrance: "none", holdMs: 0 });
  const lobby = sceneOf(view({ stage: "lobby" }));
  const intro = sceneOf(view({ stage: "intro" }));
  assert.deepEqual(planTransition(lobby, intro), { entrance: "fade", holdMs: 0 });
  assert.deepEqual(planTransition(sceneOf(null), jq7), { entrance: "title", holdMs: 0 });
});

test("animations before a question starts fit into the server reveal", () => {
  assert.ok(ZOOM_TOTAL_MS <= REVEAL_MS && TITLE_TOTAL_MS <= REVEAL_MS);
});

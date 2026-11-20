import { test } from "node:test";
import assert from "node:assert/strict";
import { musicStep } from "../src/screen/musicPlan.ts";

const m = (key: string, playing = true, url = "/media/a.mp3") => ({ key, playing, url });

test("musicStep: silence stays silent, music that goes away fades out", () => {
  assert.equal(musicStep(null, null), "none");
  assert.equal(musicStep(m("think:3"), null), "fade-out");
  assert.equal(musicStep(m("think:3", false), null), "fade-out");
});

test("musicStep: a new context loads the track from the start", () => {
  assert.equal(musicStep(null, m("lobby:0")), "load-play");
  assert.equal(musicStep(null, m("intro:1", false)), "load-pause");
  assert.equal(musicStep(m("think:3"), m("think:4")), "load-play");
  assert.equal(musicStep(m("think:3"), m("think:4", false)), "load-pause");
  // the host swapped the file under the same context
  assert.equal(musicStep(m("lobby:0"), m("lobby:0", true, "/media/b.mp3")), "load-play");
});

test("musicStep: the same context only pauses and resumes", () => {
  assert.equal(musicStep(m("intro:1", false), m("intro:1")), "play"); // the leaderboard is taken off
  assert.equal(musicStep(m("think:3"), m("think:3", false)), "pause");
  assert.equal(musicStep(m("think:3"), m("think:3")), "none"); // reconnect with the same key
  assert.equal(musicStep(m("think:3", false), m("think:3", false)), "none");
});

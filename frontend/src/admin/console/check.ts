import type { AdminView } from "../../lib/types";

/** Whether the team's answer has content (text or a chosen option). */
export function hasAnswer(a: { text: string; option: number | null } | undefined): boolean {
  return !!a && (a.text.trim() !== "" || a.option !== null);
}

/** Answered (opened question x team) pairs the host has not marked yet. */
export function uncheckedCount(view: AdminView): number {
  const free = view.state.free;
  if (!free) return 0;
  const teamIds = new Set(view.state.teams.map((t) => t.id));
  let n = 0;
  for (const qid of free.opened) {
    const answers = free.answers[String(qid)] ?? {};
    const marks = free.marks[String(qid)] ?? {};
    for (const [teamId, a] of Object.entries(answers)) {
      if (teamIds.has(teamId) && hasAnswer(a) && (marks[teamId] ?? null) === null) n++;
    }
  }
  return n;
}

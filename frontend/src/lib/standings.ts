import type { Standings } from "./types";

/** Leaders (all rows tied on the top total) and competition ranks (1, 1, 3). */
export function leadersAndRanks(s: Standings): { leaders: string[]; ranks: number[] } {
  const ranks = s.rows.map((r, i) => {
    let first = i;
    while (first > 0 && s.rows[first - 1].total === r.total) first--;
    return first + 1;
  });
  const top = s.rows[0];
  const hasResult = top !== undefined && (top.total !== 0 || s.columns.some((c) => c.closed));
  const leaders = hasResult ? s.rows.filter((r) => r.total === top.total).map((r) => r.team_id) : [];
  return { leaders, ranks };
}

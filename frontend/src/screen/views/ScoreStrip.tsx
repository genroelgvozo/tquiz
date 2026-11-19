import type { TeamPublic } from "../../lib/types";

export default function ScoreStrip({
  teams,
  scores,
  chooserId,
}: {
  teams: TeamPublic[];
  scores: Record<string, number>;
  chooserId?: string | null;
}) {
  return (
    <div className="scr-scores">
      {teams.map((t) => (
        <span key={t.id} className={t.id === chooserId ? "scr-accent" : ""}>
          {t.id === chooserId ? "▶ " : ""}
          {t.name} <b>{scores[t.id] ?? 0}</b>
        </span>
      ))}
    </div>
  );
}

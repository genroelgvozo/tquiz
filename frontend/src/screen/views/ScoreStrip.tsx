import type { TeamPublic } from "../../lib/types";

export default function ScoreStrip({ teams, chooserId }: { teams: TeamPublic[]; chooserId?: string | null }) {
  return (
    <div className="scr-scores">
      {teams.map((t) => (
        <span key={t.id} className={t.id === chooserId ? "scr-accent" : ""}>
          {t.id === chooserId ? "▶ " : ""}
          {t.name} <b>{t.score}</b>
        </span>
      ))}
    </div>
  );
}

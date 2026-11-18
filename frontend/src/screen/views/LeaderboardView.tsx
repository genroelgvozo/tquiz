import type { TeamPublic } from "../../lib/types";

export function sortTeams(teams: TeamPublic[]): TeamPublic[] {
  return [...teams].sort((a, b) => b.score - a.score);
}

export default function LeaderboardView({ teams, title = "Рейтинг" }: { teams: TeamPublic[]; title?: string }) {
  const sorted = sortTeams(teams);
  return (
    <div className="scr-center">
      <div className="scr-h2 scr-muted">{title}</div>
      <ol className="scr-rank">
        {sorted.map((t, i) => (
          <li key={t.id} className={i === 0 ? "first" : ""}>
            <span className="n">{i + 1}</span>
            <span className="name">{t.name}</span>
            <b>{t.score}</b>
          </li>
        ))}
      </ol>
    </div>
  );
}

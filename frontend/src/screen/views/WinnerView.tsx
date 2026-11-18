import type { TeamPublic } from "../../lib/types";
import LeaderboardView, { sortTeams } from "./LeaderboardView";

export default function WinnerView({ teams }: { teams: TeamPublic[] }) {
  const winner = sortTeams(teams)[0];
  return (
    <div className="scr-winner">
      {winner && (
        <div className="scr-center" style={{ flex: "none", paddingBottom: 0 }}>
          <div className="scr-h3 scr-muted">Победитель</div>
          <div className="scr-h1 scr-accent">{winner.name}</div>
        </div>
      )}
      <LeaderboardView teams={teams} title="Итоговый рейтинг" />
    </div>
  );
}

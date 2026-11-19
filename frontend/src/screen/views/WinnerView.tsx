import type { Standings } from "../../lib/types";
import StandingsTable from "./StandingsTable";

export default function WinnerView({ standings }: { standings: Standings }) {
  const first = standings.rows[0];
  const winner = first && (first.total !== 0 || standings.columns.some((c) => c.closed)) ? first : undefined;
  return (
    <div className="scr-winner">
      {winner && (
        <div className="scr-center" style={{ flex: "none", paddingBottom: 0 }}>
          <div className="scr-h3 scr-muted">Победитель</div>
          <div className="scr-h1 scr-accent">{winner.name}</div>
        </div>
      )}
      <StandingsTable standings={standings} title="Итоговый рейтинг" highlightFirst={winner !== undefined} />
    </div>
  );
}

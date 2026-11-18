import type { ScreenJeopardy, TeamPublic } from "../../lib/types";
import ScoreStrip from "./ScoreStrip";

export default function BoardView({ j, teams }: { j: ScreenJeopardy; teams: TeamPublic[] }) {
  const columns = Math.max(1, ...j.board.map((c) => c.cells.length));
  return (
    <div className="scr-board-wrap">
      <div className="scr-board" style={{ gridTemplateColumns: `1.6fr repeat(${columns}, 1fr)` }}>
        {j.board.map((cat) => (
          <div className="scr-board-row" key={cat.name} style={{ display: "contents" }}>
            <div className="scr-cell scr-cat">{cat.name}</div>
            {Array.from({ length: columns }, (_, i) => {
              const cell = cat.cells[i];
              if (!cell) return <div key={i} className="scr-cell scr-empty" />;
              return (
                <div key={cell.question_id} className={`scr-cell ${cell.played ? "scr-played" : "scr-value"}`}>
                  {cell.value}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <ScoreStrip teams={teams} chooserId={j.chooser_team_id} />
    </div>
  );
}

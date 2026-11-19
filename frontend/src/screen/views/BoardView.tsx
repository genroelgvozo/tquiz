import type { ScreenJeopardy, TeamPublic } from "../../lib/types";
import { layoutBoard } from "../../lib/board";
import ScoreStrip from "./ScoreStrip";

export default function BoardView({ j, teams }: { j: ScreenJeopardy; teams: TeamPublic[] }) {
  const { columns, rows } = layoutBoard(j.board.map((c) => c.cells));
  const colCount = Math.max(1, columns.length);
  return (
    <div className="scr-board-wrap">
      <div className="scr-board" style={{ gridTemplateColumns: `1.6fr repeat(${colCount}, 1fr)` }}>
        {j.board.map((cat, ci) => (
          <div className="scr-board-row" key={ci} style={{ display: "contents" }}>
            <div className="scr-cell scr-cat">{cat.name}</div>
            {rows[ci].map((cell, i) => {
              if (!cell) return <div key={`empty-${i}`} className="scr-cell scr-empty" />;
              return (
                <div key={`q-${cell.question_id}`} className={`scr-cell ${cell.played ? "scr-played" : "scr-value"}`}>
                  {cell.value}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <ScoreStrip teams={teams} scores={j.scores} chooserId={j.chooser_team_id} />
    </div>
  );
}

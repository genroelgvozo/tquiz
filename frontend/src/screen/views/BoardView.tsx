import { motion } from "motion/react";
import type { ScreenJeopardy, TeamPublic } from "../../lib/types";
import { layoutBoard } from "../../lib/board";
import { BLINK_MS, cellExpandTransition, variants } from "../motion";
import ScoreStrip from "./ScoreStrip";

/** The layoutId shared by a board cell and the question expanding from it. */
const cellLayoutId = (questionId: number) => `cell-${questionId}`;

export default function BoardView({
  j,
  teams,
  blinkId,
}: {
  j: ScreenJeopardy;
  teams: TeamPublic[];
  blinkId: number | null;
}) {
  const { columns, rows } = layoutBoard(j.board.map((c) => c.cells));
  const colCount = Math.max(1, columns.length);
  // the counts size the text to the cells (see .scr-board)
  const gridStyle = {
    gridTemplateColumns: `minmax(0, 1.6fr) repeat(${colCount}, minmax(0, 1fr))`,
    "--rows": Math.max(1, j.board.length),
    "--cols": colCount,
  } as React.CSSProperties;
  let wave = 0; // order of the cells in the wave of pops when the board comes in
  return (
    <div className="scr-board-wrap">
      <div className="scr-board" style={gridStyle}>
        {j.board.map((cat, ci) => (
          <div className="scr-board-row" key={ci} style={{ display: "contents" }}>
            <div className="scr-cell scr-cat">{cat.name}</div>
            {rows[ci].map((cell, i) => {
              if (!cell) return <div key={`empty-${i}`} className="scr-cell scr-empty" />;
              const index = wave++;
              const blinking = cell.question_id === blinkId;
              // The server marks the picked cell played at once; it is still drawn as before while it blinks.
              // Played cells have no layoutId (and another key): the question goes back to the board without shrinking.
              if (cell.played && !blinking) {
                return (
                  <motion.div
                    key={`p-${cell.question_id}`}
                    className="scr-cell scr-played"
                    variants={variants.boardCell}
                    custom={index}
                  >
                    {cell.value}
                  </motion.div>
                );
              }
              return (
                <motion.div
                  key={`q-${cell.question_id}`}
                  layoutId={cellLayoutId(cell.question_id)}
                  className={`scr-cell scr-value${blinking ? " scr-blink" : ""}`}
                  style={blinking ? { animationDuration: `${4 * BLINK_MS}ms` } : undefined}
                  variants={variants.boardCell}
                  custom={index}
                >
                  {cell.value}
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>
      <ScoreStrip teams={teams} scores={j.scores} chooserId={j.chooser_team_id} />
    </div>
  );
}

/**
 * The picked cell expanding from its place on the board to the whole screen: it takes over the cell's layoutId
 * (the cell itself is hidden meanwhile), then fades away over the question.
 */
export function CellExpand({ questionId }: { questionId: number }) {
  return (
    <motion.div
      className="scr-expand"
      layoutId={cellLayoutId(questionId)}
      layoutCrossfade={false}
      variants={variants.cellExpand}
      initial="hidden"
      animate="visible"
      transition={cellExpandTransition}
    />
  );
}

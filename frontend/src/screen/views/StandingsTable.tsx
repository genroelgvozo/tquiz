import { motion } from "motion/react";
import { ROW_STEP_S, variants } from "../motion";
import type { Standings } from "../../lib/types";
import { leadersAndRanks } from "../../lib/standings";

export default function StandingsTable({
  standings,
  title,
  highlightLeaders = false,
  startDelay = 0.2,
}: {
  standings: Standings;
  title: string;
  highlightLeaders?: boolean;
  /** Seconds before the first row slides in (the table takes its entrance from the scene or layer around it). */
  startDelay?: number;
}) {
  const { leaders, ranks } = leadersAndRanks(standings);
  return (
    <div className="scr-center">
      <div className="scr-h2 scr-muted">{title}</div>
      <table className="scr-standings" style={{ "--rounds": Math.max(standings.columns.length, 1) } as React.CSSProperties}>
        <thead>
          <tr>
            <th className="n" />
            <th className="name" />
            {standings.columns.map((c) => (
              <th key={c.index} className="round" title={c.title}>
                <span className="label clamp">
                  {c.index + 1}. {c.title}
                </span>
              </th>
            ))}
            <th className="total">
              <span className="label">Итого</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.rows.map((r, i) => (
            <motion.tr key={r.team_id} variants={variants.standingsRow} custom={startDelay + i * ROW_STEP_S} className={highlightLeaders && leaders.includes(r.team_id) ? "first" : ""}>
              <td className="n">{ranks[i]}</td>
              <td className="name">{r.name}</td>
              {standings.columns.map((c, ci) => (
                <td key={c.index} className="round">
                  {c.closed && r.rounds[ci] !== null && r.rounds[ci] !== undefined ? r.rounds[ci] : "—"}
                </td>
              ))}
              <td className="total">
                <b>{r.total}</b>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

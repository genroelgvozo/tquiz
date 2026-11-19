import type { Standings } from "../../lib/types";
import { leadersAndRanks } from "../../lib/standings";

export default function StandingsTable({
  standings,
  title,
  highlightLeaders = false,
}: {
  standings: Standings;
  title: string;
  highlightLeaders?: boolean;
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
                <span className="clamp">
                  {c.index + 1}. {c.title}
                </span>
              </th>
            ))}
            <th className="total">Итого</th>
          </tr>
        </thead>
        <tbody>
          {standings.rows.map((r, i) => (
            <tr key={r.team_id} className={highlightLeaders && leaders.includes(r.team_id) ? "first" : ""}>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

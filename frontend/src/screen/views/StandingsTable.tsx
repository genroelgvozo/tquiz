import type { Standings } from "../../lib/types";

export default function StandingsTable({
  standings,
  title,
  highlightFirst = false,
}: {
  standings: Standings;
  title: string;
  highlightFirst?: boolean;
}) {
  return (
    <div className="scr-center">
      <div className="scr-h2 scr-muted">{title}</div>
      <table className="scr-standings">
        <thead>
          <tr>
            <th className="n" />
            <th className="name" />
            {standings.columns.map((c) => (
              <th key={c.index} className="round" title={c.title}>
                {c.index + 1}. {c.title}
              </th>
            ))}
            <th className="total">Итого</th>
          </tr>
        </thead>
        <tbody>
          {standings.rows.map((r, i) => (
            <tr key={r.team_id} className={highlightFirst && i === 0 ? "first" : ""}>
              <td className="n">{i + 1}</td>
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

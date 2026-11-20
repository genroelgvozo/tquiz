import { motion } from "motion/react";
import { variants } from "../motion";
import type { Standings } from "../../lib/types";
import { leadersAndRanks } from "../../lib/standings";
import StandingsTable from "./StandingsTable";

export default function WinnerView({ standings }: { standings: Standings }) {
  const { leaders } = leadersAndRanks(standings);
  const names = standings.rows.filter((r) => leaders.includes(r.team_id)).map((r) => r.name);
  return (
    <div className="scr-winner">
      {names.length > 0 && (
        <div className="scr-center" style={{ flex: "none", paddingBottom: 0 }}>
          <div className="scr-h3 scr-muted">{names.length === 1 ? "Победитель" : "Победители"}</div>
          <motion.div className="scr-h1 scr-accent" variants={variants.winnerName}>
            {names.join(", ")}
          </motion.div>
        </div>
      )}
      <StandingsTable standings={standings} title="Итоговый рейтинг" highlightLeaders={names.length > 0} startDelay={1.0} />
    </div>
  );
}

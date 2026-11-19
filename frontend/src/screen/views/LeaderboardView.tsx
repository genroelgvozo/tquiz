import type { Standings } from "../../lib/types";
import StandingsTable from "./StandingsTable";

export default function LeaderboardView({ standings, title = "Рейтинг" }: { standings: Standings; title?: string }) {
  return <StandingsTable standings={standings} title={title} />;
}

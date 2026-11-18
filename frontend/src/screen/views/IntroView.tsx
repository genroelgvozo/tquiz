import type { RoundPublic } from "../../lib/types";

export default function IntroView({ round }: { round: RoundPublic }) {
  return (
    <div className="scr-center">
      <div className="scr-muted scr-h3">
        Тур {round.index + 1} из {round.total}
      </div>
      <div className="scr-h1">{round.title}</div>
      <div className="scr-accent scr-h3">{round.kind === "jeopardy" ? "Своя игра" : "Свободный ввод"}</div>
    </div>
  );
}

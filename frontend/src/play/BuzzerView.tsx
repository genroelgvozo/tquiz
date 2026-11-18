import { BuzzBar } from "../components/BuzzBar";
import { useTicker } from "../lib/clock";
import type { TeamJeopardy } from "../lib/types";

const CAPTIONS: Record<TeamJeopardy["buzzer"], string> = {
  closed: "",
  bar: "Ждите, пока заполнится полоска",
  open: "",
  locked_out: "Рано!",
  answering_me: "Вы отвечаете!",
  answering_other: "Отвечает другая команда",
  excluded: "Вы уже отвечали",
};

export default function BuzzerView({
  j,
  now,
  onBuzz,
}: {
  j: TeamJeopardy;
  now: () => number;
  onBuzz: () => void;
}) {
  useTicker(100);
  let status = j.buzzer;
  // the lockout ends on the client clock without waiting for a new snapshot
  if (status === "locked_out" && j.locked_until !== null && now() >= j.locked_until) {
    status = j.bar_ends_at !== null && now() < j.bar_ends_at ? "bar" : "open";
  }
  const active = status === "open";

  return (
    <div className="play-center">
      <div className="play-stack">
        <div className="play-muted">{j.label ?? "Ждём вопрос…"}</div>
        <button
          className={`buzzer ${active ? "active" : ""} ${status === "answering_me" ? "me" : ""}`}
          disabled={!active}
          onPointerDown={(e) => {
            e.preventDefault();
            if (!active) return;
            navigator.vibrate?.(50);
            onBuzz();
          }}
        >
          ЖМИ
        </button>
        {status === "bar" && j.bar_ends_at !== null && (
          <BuzzBar endsAt={j.bar_ends_at} seconds={j.bar_seconds} now={now} />
        )}
        <div className={`play-caption ${status === "answering_me" ? "accent" : ""}`}>{CAPTIONS[status]}</div>
      </div>
    </div>
  );
}

import { BuzzBar } from "../components/BuzzBar";
import { useTicker } from "../lib/clock";
import type { TeamJeopardy } from "../lib/types";

const CAPTIONS: Record<TeamJeopardy["buzzer"], string> = {
  closed: "",
  bar: "Ждите, пока заполнится полоска — раньше нажмёте, кнопка заблокируется",
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
  useTicker(50);
  const t = now();
  let status = j.buzzer;
  // timings are applied on the (server-corrected) client clock without waiting for a snapshot
  if (status === "locked_out" && j.locked_until !== null && t >= j.locked_until) {
    status = j.bar_ends_at !== null && t < j.bar_ends_at ? "bar" : "open";
  }
  if (status === "bar" && j.bar_ends_at !== null && t >= j.bar_ends_at) status = "open";
  const active = status === "open";
  // during the bar the button looks inactive but still sends: pressing early is a false start (~1 s lock)
  const pressable = active || status === "bar";

  return (
    <div className="play-center">
      <div className="play-stack">
        <div className="play-muted">{j.label ?? "Ждём вопрос…"}</div>
        <button
          className={`buzzer ${active ? "active" : ""} ${status === "answering_me" ? "me" : ""}`}
          disabled={!pressable}
          onPointerDown={(e) => {
            e.preventDefault();
            if (!pressable) return;
            if (active) navigator.vibrate?.(50);
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

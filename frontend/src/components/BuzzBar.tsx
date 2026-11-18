import { useTicker } from "../lib/clock";

/** White bar filling up until the buzzers open. */
export function BuzzBar({ endsAt, seconds, now }: { endsAt: number; seconds: number; now: () => number }) {
  useTicker(50);
  const left = Math.max(0, endsAt - now());
  const fill = seconds > 0 ? 1 - left / seconds : 1;
  return (
    <div className="buzz-bar">
      <div className="buzz-bar-fill" style={{ width: `${Math.min(1, Math.max(0, fill)) * 100}%` }} />
    </div>
  );
}

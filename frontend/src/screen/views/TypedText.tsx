import { useEffect, useState } from "react";
import type { TypingView } from "../../lib/types";
import { caretOf, typedChars } from "../../lib/typing";

/** Re-renders the component on every frame while `active`. */
function useFrames(active: boolean): void {
  const [, setFrame] = useState(0);
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      setFrame((f) => f + 1);
      id = window.requestAnimationFrame(tick);
    };
    id = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(id);
  }, [active]);
}

/**
 * A question printed letter by letter from the server's printing state: the printed part, the caret, and the rest kept
 * invisible so it holds its place and the layout never jumps. Without printing (`typing` null) the whole text.
 */
export function TypedText({ text, typing, now }: { text: string; typing: TypingView | null; now: () => number }) {
  const printed = typedChars(typing, now(), text.length);
  const caret = caretOf(typing, printed, text.length);
  useFrames(caret === "blink");
  if (typing === null || printed >= text.length) return <>{text}</>;
  return (
    <>
      {text.slice(0, printed)}
      {caret !== "none" && <span className={`scr-caret${caret === "still" ? " still" : ""}`} aria-hidden="true" />}
      <span className="scr-typed-rest">{text.slice(printed)}</span>
    </>
  );
}

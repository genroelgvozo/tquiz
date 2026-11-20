import { AnimatePresence, motion, type Variants } from "motion/react";
import { useState } from "react";

/** The background picture flows into the next one over this time. */
const BACKDROP_FADE_MS = 500;
const FADE_S = BACKDROP_FADE_MS / 1000;

// `custom` (from AnimatePresence) tells the leaving picture whether another one replaces it
const layer: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: FADE_S, ease: "easeInOut" } },
  // under a new picture the old one stays whole until the new one has come in, so the theme colour doesn't show through;
  // with nothing in its place it fades out
  gone: (replaced: boolean) =>
    replaced
      ? { opacity: 0, transition: { delay: FADE_S, duration: 0 } }
      : { opacity: 0, transition: { duration: FADE_S, ease: "easeInOut" } },
};

function Picture({ url }: { url: string }) {
  // a missing file hides the layer: the theme colour shows, without a broken-image icon
  const [failed, setFailed] = useState(false);
  return (
    <motion.img
      className="scr-backdrop-img"
      src={url}
      alt=""
      variants={layer}
      initial="hidden"
      animate="shown"
      exit="gone"
      style={failed ? { visibility: "hidden" } : undefined}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * A picture over the whole screen (cover), under everything else in its container.
 * The first picture is drawn at once; a change of `url` is a crossfade.
 */
export function Backdrop({ url }: { url: string | null }) {
  return (
    <div className="scr-backdrop" aria-hidden="true">
      <AnimatePresence initial={false} custom={url !== null}>
        {url && <Picture key={url} url={url} />}
      </AnimatePresence>
    </div>
  );
}

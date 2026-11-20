import { AnimatePresence, motion } from "motion/react";
import { Qr } from "../../components/Qr";
import type { ScreenView } from "../../lib/types";
import { variants } from "../motion";

export default function LobbyView({ view }: { view: ScreenView }) {
  return (
    <div className="scr-lobby">
      {view.qr_visible && <Qr value={view.join_url} size={Math.round(Math.min(window.innerHeight * 0.45, 420))} />}
      <div className="scr-lobby-side">
        <div className="scr-quiz-title">{view.quiz_title}</div>
        {view.qr_visible && (
          <>
            <div className="scr-h2">Сканируйте, чтобы войти</div>
            <div className="scr-muted">{view.join_url.replace(/^https?:\/\//, "")}</div>
          </>
        )}
        <ul className="scr-team-list">
          {/* initial={false}: teams already there at the first draw do not pop */}
          <AnimatePresence initial={false}>
            {view.teams.map((t) => (
              <motion.li key={t.id} variants={variants.pop} initial="hidden" animate="visible" exit="exit">
                ✓ {t.name}
              </motion.li>
            ))}
            {view.teams.length === 0 && (
              <motion.li key="waiting" className="scr-muted" variants={variants.fade} initial="hidden" animate="visible" exit="exit">
                Ждём команды…
              </motion.li>
            )}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}

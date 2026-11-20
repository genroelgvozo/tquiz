const enterFullscreen = () => void document.documentElement.requestFullscreen?.().catch(() => {});

/** Two small icons at the top right: sound (crossed out until it is on) and fullscreen (only by this icon). */
export function SoundControls({ soundOn, onSound }: { soundOn: boolean; onSound: () => void }) {
  return (
    <div className="scr-controls">
      <button
        className="scr-icon"
        title={soundOn ? "Звук включён" : "Включить звук"}
        aria-label={soundOn ? "Звук включён" : "Включить звук"}
        onClick={onSound}
      >
        {soundOn ? "🔊" : "🔇"}
      </button>
      <button className="scr-icon" title="На весь экран" aria-label="На весь экран" onClick={enterFullscreen}>
        ⛶
      </button>
    </div>
  );
}

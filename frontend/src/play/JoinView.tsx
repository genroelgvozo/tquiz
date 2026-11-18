import { useState } from "react";

export default function JoinView({
  onJoin,
  message,
}: {
  onJoin: (name: string) => void;
  message: string | null;
}) {
  const [name, setName] = useState("");
  return (
    <form
      className="play-center"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onJoin(name.trim());
      }}
    >
      <div className="play-stack">
        <div className="play-title">Название команды</div>
        <input
          className="play-input"
          value={name}
          maxLength={40}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          placeholder="Например, Котики"
        />
        {message && <div className="play-error">{message}</div>}
        <button className="play-btn" disabled={!name.trim()}>
          Войти
        </button>
      </div>
    </form>
  );
}

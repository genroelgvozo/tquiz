import { useState } from "react";
import { api, ApiError } from "../lib/api";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/api/auth/login", { password });
      onLogin();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="login card" onSubmit={submit}>
      <h2 style={{ marginTop: 0 }}>TQuiz · ведущий</h2>
      <label className="field">
        <span>Пароль</span>
        <input type="password" value={password} autoFocus onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="error-text">{error}</p>}
      <button className="btn primary" disabled={busy || !password}>
        Войти
      </button>
    </form>
  );
}

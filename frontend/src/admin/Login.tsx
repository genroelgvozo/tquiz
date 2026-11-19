import { Button, Paper, PasswordInput, Stack, Title } from "@mantine/core";
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
    <Paper component="form" onSubmit={submit} withBorder p="lg" w={320} mx="auto">
      <Stack>
        <Title order={3}>TQuiz · ведущий</Title>
        <PasswordInput
          label="Пароль"
          value={password}
          autoFocus
          error={error}
          onChange={(e) => setPassword(e.currentTarget.value)}
        />
        <Button type="submit" loading={busy} disabled={!password}>
          Войти
        </Button>
      </Stack>
    </Paper>
  );
}

import "@mantine/core/styles.css";
import { createTheme, MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api } from "../lib/api";
import "./admin.css";
import Console from "./console/Console";
import Login from "./Login";
import QuizEditor from "./QuizEditor";
import QuizList from "./QuizList";

const theme = createTheme({
  primaryColor: "dark",
  fontFamily: "var(--font)",
  defaultRadius: "md",
});

/** Admin routes are lazy-loaded (see App.tsx), so Mantine never reaches the phones or the hall screen. */
export default function AdminApp() {
  return (
    <MantineProvider theme={theme} forceColorScheme="light">
      <ModalsProvider modalProps={{ centered: true }}>
        <AdminRoutes />
      </ModalsProvider>
    </MantineProvider>
  );
}

function AdminRoutes() {
  const [admin, setAdmin] = useState<boolean | null>(null);

  const check = () => {
    api<{ admin: boolean }>("GET", "/api/auth/me")
      .then((r) => setAdmin(r.admin))
      .catch(() => setAdmin(false));
  };
  useEffect(check, []);

  const logout = async () => {
    await api("POST", "/api/auth/logout");
    setAdmin(false);
  };

  if (admin === null) return <div className="admin" />;
  if (!admin)
    return (
      <div className="admin">
        <Login onLogin={check} />
      </div>
    );

  return (
    <div className="admin">
      <nav className="admin-nav">
        <span className="brand">TQuiz</span>
        <NavLink to="/admin" end>
          Квизы
        </NavLink>
        <NavLink to="/admin/game">Пульт</NavLink>
        <span className="spacer" />
        <button className="btn ghost" onClick={logout}>
          Выйти
        </button>
      </nav>
      <Routes>
        <Route index element={<QuizList />} />
        <Route path="quiz/:id" element={<QuizEditor />} />
        <Route path="game" element={<Console />} />
      </Routes>
    </div>
  );
}

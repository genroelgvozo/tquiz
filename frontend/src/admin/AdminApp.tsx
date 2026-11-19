import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import {
  AppShell,
  Badge,
  Box,
  Button,
  Container,
  createTheme,
  Group,
  MantineProvider,
  Text,
  Title,
} from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { useEffect, useState, type ReactNode } from "react";
import { Link, Route, Routes, useMatch } from "react-router-dom";
import { api } from "../lib/api";
import "./admin.css";
import Console from "./console/Console";
import Login from "./Login";
import QuizEditor from "./QuizEditor";
import QuizList from "./QuizList";

const theme = createTheme({
  primaryColor: "dark",
  fontFamily: "var(--font)",
  headings: { fontFamily: "var(--font)" },
  defaultRadius: "md",
  components: {
    // the admin is dense (spec §4): body text at 14px like the inputs and buttons
    Text: Text.extend({ defaultProps: { size: "sm" } }),
    // badges carry team names and short labels, so no forced uppercase
    Badge: Badge.extend({ defaultProps: { variant: "light", color: "gray", tt: "none" } }),
  },
});

/** Admin routes are lazy-loaded (see App.tsx), so Mantine never reaches the phones or the hall screen. */
export default function AdminApp() {
  return (
    <MantineProvider theme={theme} forceColorScheme="light">
      <Notifications position="bottom-right" autoClose={4000} />
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

  if (admin === null) return null;
  if (!admin)
    return (
      <Box mih="100%" bg="gray.0" fz="sm" pt="15vh">
        <Login onLogin={check} />
      </Box>
    );

  return (
    <AppShell header={{ height: 52 }} padding="md" bg="gray.0" fz="sm">
      <AppShell.Header px="md">
        <Group h="100%" gap="xs">
          <Title order={4} mr="sm">
            TQuiz
          </Title>
          <NavButton to="/admin" end>
            Квизы
          </NavButton>
          <NavButton to="/admin/game">Пульт</NavButton>
          <Button variant="subtle" color="gray" ml="auto" onClick={logout}>
            Выйти
          </Button>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="xl" px={0}>
          <Routes>
            <Route index element={<QuizList />} />
            <Route path="quiz/:id" element={<QuizEditor />} />
            <Route path="game" element={<Console />} />
          </Routes>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

function NavButton({ to, end = false, children }: { to: string; end?: boolean; children: ReactNode }) {
  const active = useMatch({ path: to, end }) !== null;
  return (
    <Button component={Link} to={to} variant={active ? "light" : "subtle"} color={active ? "dark" : "gray"}>
      {children}
    </Button>
  );
}

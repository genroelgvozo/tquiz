import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import PlayApp from "./play/PlayApp";

// separate chunks: the admin pulls in Mantine, phones should not download it nor the hall screen
const AdminApp = lazy(() => import("./admin/AdminApp"));
const ScreenApp = lazy(() => import("./screen/ScreenApp"));

export default function App() {
  return (
    <Routes>
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={null}>
            <AdminApp />
          </Suspense>
        }
      />
      <Route path="/screen" element={
          <Suspense fallback={null}>
            <ScreenApp />
          </Suspense>
        }
      />
      <Route path="/play" element={<PlayApp />} />
      <Route path="*" element={<Navigate to="/play" replace />} />
    </Routes>
  );
}

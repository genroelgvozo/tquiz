import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import PlayApp from "./play/PlayApp";
import ScreenApp from "./screen/ScreenApp";

// separate chunk: the admin pulls in Mantine, phones and the hall screen should not download it
const AdminApp = lazy(() => import("./admin/AdminApp"));

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
      <Route path="/screen" element={<ScreenApp />} />
      <Route path="/play" element={<PlayApp />} />
      <Route path="*" element={<Navigate to="/play" replace />} />
    </Routes>
  );
}

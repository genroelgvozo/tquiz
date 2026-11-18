import { Navigate, Route, Routes } from "react-router-dom";
import AdminApp from "./admin/AdminApp";
import PlayApp from "./play/PlayApp";
import ScreenApp from "./screen/ScreenApp";

export default function App() {
  return (
    <Routes>
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="/screen" element={<ScreenApp />} />
      <Route path="/play" element={<PlayApp />} />
      <Route path="*" element={<Navigate to="/play" replace />} />
    </Routes>
  );
}

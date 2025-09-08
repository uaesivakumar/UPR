// dashboard/src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/sidebar";
import ProtectedRoute from "./components/ProtectedRoute";
import DashboardHome from "./pages/DashboardHome";
import LeadsPage from "./pages/LeadsPage";
import EnrichmentPage from "./pages/EnrichmentPage";
import MessagesPage from "./pages/MessagesPage";
import Login from "./pages/Login";

function Shell() {
  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 p-6">
        <Routes>
          <Route index element={<DashboardHome />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="enrichment" element={<EnrichmentPage />} />
          <Route path="messages" element={<MessagesPage />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/*" element={<Shell />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

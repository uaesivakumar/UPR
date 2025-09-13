// dashboard/src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/sidebar";
import Topbar from "./components/Topbar";
import DashboardHome from "./pages/DashboardHome";
import LeadsPage from "./pages/LeadsPage";
import EnrichmentPage from "./pages/EnrichmentPage";
import MessagesPage from "./pages/MessagesPage";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";

function Shell({ children }) {
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Topbar />
        <main className="flex-1 p-4 md:p-6 bg-gray-50">{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Shell>
                <DashboardHome />
              </Shell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/leads"
          element={
            <ProtectedRoute>
              <Shell>
                <LeadsPage />
              </Shell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/enrichment"
          element={
            <ProtectedRoute>
              <Shell>
                <EnrichmentPage />
              </Shell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/messages"
          element={
            <ProtectedRoute>
              <Shell>
                <MessagesPage />
              </Shell>
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Login />} />
      </Routes>
    </BrowserRouter>
  );
}

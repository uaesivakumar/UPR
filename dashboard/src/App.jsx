import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import "./App.css";

// Layout components
import Sidebar from "./components/sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";

// Pages via barrel (case-sensitive)
import {
  DashboardHome,
  EnrichmentPage,
  CompaniesPage,
  HRLeads,
  MessagesPage,
} from "./pages";

/**
 * AppShell: shared layout (sidebar + topbar) with an outlet for page content.
 * Keeps routing clean and prevents re-rendering the chrome for each route.
 */
function AppShell() {
  return (
    <div className="min-h-screen w-full bg-gray-50 text-gray-900 flex">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Wrap all app pages behind auth if your ProtectedRoute uses <Outlet /> */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/enrichment" element={<EnrichmentPage />} />
            <Route path="/companies" element={<CompaniesPage />} />
            <Route path="/hr-leads" element={<HRLeads />} />
            <Route path="/messages" element={<MessagesPage />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

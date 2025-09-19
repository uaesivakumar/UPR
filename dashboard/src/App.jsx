import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import "./App.css";

import Sidebar from "./components/sidebar.jsx";
import Topbar from "./components/Topbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";

// Barrel exports (case-sensitive)
import {
  DashboardHome,
  EnrichmentPage,
  CompaniesPage,
  HRLeads,
  MessagesPage,
} from "./pages";

// Direct import for Login (not behind auth)
import Login from "./pages/Login.jsx";

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
      <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading…</div>}>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />

          {/* Private app routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardHome />} />
              <Route path="/enrichment" element={<EnrichmentPage />} />
              <Route path="/companies" element={<CompaniesPage />} />
              <Route path="/hr-leads" element={<HRLeads />} />
              <Route path="/messages" element={<MessagesPage />} />
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

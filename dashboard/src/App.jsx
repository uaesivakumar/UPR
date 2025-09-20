import React from "react";
import { createBrowserRouter, RouterProvider, Outlet } from "react-router-dom";
import Topbar from "./components/Topbar.jsx";
import Sidebar from "./components/sidebar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AppError from "./components/AppError.jsx";

// pages (import directly; avoid lazy until we’re stable)
import DashboardHome from "./pages/DashboardHome.jsx";
import EnrichmentPage from "./pages/EnrichmentPage.jsx";
import CompaniesPage from "./pages/CompaniesPage.jsx";
import HRLeads from "./pages/HRLeads.jsx";
import MessagesPage from "./pages/MessagesPage.jsx";
import Login from "./pages/Login.jsx";

function Shell() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Topbar />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NotFound() {
  return <div className="p-6">Not found.</div>;
}

// Provide errorElement on EVERY top-level branch
const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
    errorElement: <AppError />,
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <Shell />
      </ProtectedRoute>
    ),
    errorElement: <AppError />,
    children: [
      { index: true, element: <DashboardHome /> },
      { path: "enrichment", element: <EnrichmentPage /> },
      { path: "companies", element: <CompaniesPage /> },
      { path: "hr-leads", element: <HRLeads /> },
      { path: "messages", element: <MessagesPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return (
    <AppError>
      <RouterProvider router={router} />
    </AppError>
  );
}

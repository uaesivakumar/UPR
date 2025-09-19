import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

/**
 * ProtectedRoute
 * - If no token, redirect to /login (preserving "from")
 * - If children are provided, render them; else render <Outlet />
 */
export default function ProtectedRoute({ children }) {
  let token = null;
  try {
    token = localStorage.getItem("token");
  } catch (_) {
    token = null;
  }

  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children ?? <Outlet />;
}

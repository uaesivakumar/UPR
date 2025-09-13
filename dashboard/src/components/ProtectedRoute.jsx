// dashboard/src/components/ProtectedRoute.jsx
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { getToken } from "../utils/auth";

export default function ProtectedRoute() {
  const loc = useLocation();
  const token = getToken();
  if (!token) {
    // Bounce to login, remember where we wanted to go
    return (
      <Navigate
        to="/login"
        replace
        state={{ next: `${loc.pathname}${loc.search}` }}
      />
    );
  }
  return <Outlet />;
}

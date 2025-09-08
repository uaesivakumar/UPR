// dashboard/src/components/ProtectedRoute.tsx
import { Navigate, Outlet } from "react-router-dom";
import { isAuthed } from "../utils/auth";

export default function ProtectedRoute() {
  if (!isAuthed()) return <Navigate to="/login" replace />;
  return <Outlet />;
}

import { useNavigate, useLocation } from "react-router-dom";
import { clearToken } from "../utils/auth";

export default function Topbar({ title = "Dashboard", onSearch, onAdd, rightSlot }) {
  const navigate = useNavigate();
  const location = useLocation();

  function logout() {
    clearToken();
    navigate("/login", { replace: true });
  }

  const showAdd = typeof onAdd === "function";
  const showSearch = typeof onSearch === "function";

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">{location.pathname.replace("/", "") || "home"}</p>
      </div>

      <div className="flex w-full items-center gap-3 sm:w-auto">
        {showSearch && (
          <input
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search companies, roles…"
            className="w-full sm:w-72 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-gray-900"
          />
        )}
        {showAdd && (
          <button
            onClick={onAdd}
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-gray-800"
          >
            Add Lead
          </button>
        )}
        {rightSlot}
        <button
          onClick={logout}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

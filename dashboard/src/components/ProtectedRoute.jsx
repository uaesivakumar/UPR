import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isAuthed } from "../utils/auth";

export default function ProtectedRoute({ children }) {
  const [ok, setOk] = useState(null);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    (async () => {
      const authed = await isAuthed();
      if (authed) setOk(true);
      else {
        setOk(false);
        nav(`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`, { replace: true });
      }
    })();
  }, [nav, loc.pathname, loc.search]);

  if (ok === null) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-gray-600">
        Checking access…
      </div>
    );
  }
  return ok ? children : null;
}

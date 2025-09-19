import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

if (!window.__UPR_GLOBAL_ERROR_WIRED__) {
  window.__UPR_GLOBAL_ERROR_WIRED__ = true;
  window.addEventListener("error", (e) => {
    window.__UPR_LAST_UI_ERROR__ = e?.error || e?.message || e;
    console.error("Global error:", e?.error || e);
  });
  window.addEventListener("unhandledrejection", (e) => {
    window.__UPR_LAST_UI_ERROR__ = e?.reason || e;
    console.error("Unhandled promise rejection:", e?.reason || e);
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

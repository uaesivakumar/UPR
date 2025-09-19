import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

// Global error visibility (helps when errors happen before React mounts)
window.addEventListener("error", (e) => {
  // eslint-disable-next-line no-console
  console.error("Global error:", e.error || e.message, e);
});
window.addEventListener("unhandledrejection", (e) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled promise rejection:", e.reason);
});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename="/">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

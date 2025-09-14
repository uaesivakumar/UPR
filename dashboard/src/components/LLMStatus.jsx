import React from "react";

/**
 * Always-visible LLM status pill for the top of the page.
 *
 * Props:
 *  - status: "idle" | "running" | "ok" | "error"
 *  - model: string | null
 *  - durationMs: number | null   (request latency)
 *  - errorText: string | null    (optional short error)
 */
export default function LLMStatus({
  status = "idle",
  model = null,
  durationMs = null,
  errorText = null,
}) {
  const tone =
    {
      idle: "bg-gray-100 text-gray-700 border border-gray-200",
      running: "bg-blue-50 text-blue-700 border border-blue-200",
      ok: "bg-green-50 text-green-700 border border-green-200",
      error: "bg-red-50 text-red-700 border border-red-200",
    }[status] || "bg-gray-100 text-gray-700 border border-gray-200";

  return (
    <div className="mb-4 flex items-center justify-between">
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${tone}`}>
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            status === "running"
              ? "animate-pulse bg-current opacity-80"
              : "bg-current opacity-60"
          }`}
        />
        <span className="font-medium">LLM</span>
        <span className="opacity-80">
          {status === "idle" && "idle"}
          {status === "running" && "working…"}
          {status === "ok" && (model || "ready")}
          {status === "error" && "error"}
        </span>
        {status === "ok" && typeof durationMs === "number" && (
          <span className="opacity-70">• {Math.max(0, Math.round(durationMs))} ms</span>
        )}
      </div>

      {status === "error" && errorText && (
        <div className="text-sm text-red-700">{errorText}</div>
      )}
    </div>
  );
}

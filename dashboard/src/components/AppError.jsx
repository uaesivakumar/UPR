import React from "react";

export default class AppError extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    // stash on window for quick console inspection
    // run: window.__UPR_LAST_UI_ERROR__
    window.__UPR_LAST_UI_ERROR__ = error;
    return { error };
  }
  componentDidCatch(error, info) {
    window.__UPR_LAST_UI_ERROR_INFO__ = info;
    // eslint-disable-next-line no-console
    console.error("UI crashed:", error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-3xl w-full border border-red-200 bg-red-50 text-red-900 rounded-xl p-6">
          <h1 className="text-xl font-semibold mb-2">
            Something went wrong rendering the app.
          </h1>
          <p className="mb-4">{String(this.state.error?.message || "Error")}</p>
          <details className="whitespace-pre-wrap text-xs opacity-80">
{this.state.error?.stack}
          </details>
          <button
            className="mt-4 px-3 py-1.5 rounded bg-red-600 text-white"
            onClick={() => location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

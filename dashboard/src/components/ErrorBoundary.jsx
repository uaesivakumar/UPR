import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, err: null };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, err };
  }
  componentDidCatch(err, info) {
    // eslint-disable-next-line no-console
    console.error("UI crashed:", err, info);
    window.__UPR_LAST_UI_ERROR__ = { err: String(err), info };
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ padding: 16 }}>
        <div style={{
          border: "1px solid #fecaca",
          background: "#fef2f2",
          color: "#991b1b",
          borderRadius: 12,
          padding: 16,
          maxWidth: 900,
          margin: "24px auto",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
        }}>
          <strong>Something went wrong rendering the app.</strong>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>
{String(this.state.err || "Unknown render error")}
          </pre>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            Check the browser devtools Console for details.
          </div>
        </div>
      </div>
    );
  }
}

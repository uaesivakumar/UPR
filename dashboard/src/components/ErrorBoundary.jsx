import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, err: null, stack: null, compStack: null };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, err };
  }
  componentDidCatch(err, info) {
    const stack = err?.stack || String(err);
    const compStack = info?.componentStack || "";
    // log to console for devtools
    // eslint-disable-next-line no-console
    console.error("UI crashed:", err, info);
    // stash globally for quick inspect
    window.__UPR_LAST_UI_ERROR__ = { message: err?.message || String(err), stack, compStack };
    this.setState({ stack, compStack });
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    const msg = this.state.err?.message || String(this.state.err || "Error");
    return (
      <div style={{ padding: 16 }}>
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 12,
            padding: 16,
            maxWidth: 960,
            margin: "24px auto",
            fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Something went wrong rendering the app.</div>
          <div style={{ whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
            <strong>{msg}</strong>
          </div>
          {this.state.compStack ? (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer" }}>Component stack</summary>
              <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.compStack}</pre>
            </details>
          ) : null}
          {this.state.stack ? (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer" }}>Error stack</summary>
              <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.stack}</pre>
            </details>
          ) : null}
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
            Open DevTools → Console. You can also run <code>window.__UPR_LAST_UI_ERROR__</code> to view details.
          </div>
        </div>
      </div>
    );
  }
}

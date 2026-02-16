import React, { Component, ErrorInfo, ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ componentStack: errorInfo.componentStack ?? null });
    if (typeof console !== "undefined" && console.error) {
      console.error("[ErrorBoundary]", error.message, "\n", error.stack, "\n", errorInfo.componentStack);
    }
    if (typeof window !== "undefined" && window.__debugLog) {
      window.__debugLog("ErrorBoundary", { error: error.message, stack: error.stack, componentStack: errorInfo.componentStack });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const err = this.state.error;
      const componentStack = this.state.componentStack;
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            boxSizing: "border-box",
            fontFamily: "system-ui, sans-serif",
            background: "var(--color-bg-page, #f3f4f6)",
            color: "var(--color-text-primary, #111)",
          }}
        >
          <p style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem", textAlign: "center" }}>
            Что-то пошло не так
          </p>
          <p style={{ fontSize: "0.9rem", color: "var(--color-text-secondary, #6b7280)", marginBottom: "0.5rem", textAlign: "center", maxWidth: "20rem" }}>
            Произошла ошибка. Попробуйте обновить страницу. Если ошибка повторяется — нажмите «Очистить данные и обновить» (придётся войти заново).
          </p>
          {err?.message && (
            <p style={{ fontSize: "0.8rem", color: "#b91c1c", background: "#fef2f2", padding: "0.5rem 0.75rem", borderRadius: "0.5rem", maxWidth: "22rem", marginBottom: "1rem", textAlign: "left", wordBreak: "break-word" }}>
              {err.message}
            </p>
          )}
          {(err?.stack || componentStack) && (
            <details style={{ marginBottom: "1rem", maxWidth: "100%" }} open>
              <summary style={{ fontSize: "0.8rem", cursor: "pointer", color: "#b91c1c" }}>Подробности (stack trace и компоненты)</summary>
              {err?.stack && (
                <pre style={{ fontSize: "0.7rem", color: "#b91c1c", background: "#fef2f2", padding: "0.75rem", borderRadius: "0.5rem", maxWidth: "100%", overflow: "auto", marginTop: "0.5rem", textAlign: "left" }}>
                  {err.stack}
                </pre>
              )}
              {componentStack && (
                <pre style={{ fontSize: "0.7rem", color: "#1e40af", background: "#eff6ff", padding: "0.75rem", borderRadius: "0.5rem", maxWidth: "100%", overflow: "auto", marginTop: "0.5rem", textAlign: "left" }}>
                  {componentStack}
                </pre>
              )}
            </details>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "0.5rem 1rem",
                fontSize: "0.9rem",
                fontWeight: 500,
                color: "#fff",
                background: "var(--color-primary-blue, #2563eb)",
                border: "none",
                borderRadius: "0.5rem",
                cursor: "pointer",
              }}
            >
              Обновить страницу
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  const keys = ["haulz.accounts", "haulz.activeAccountId", "haulz.selectedAccountIds", "haulz.auth", "haulz.dateFilterState"];
                  keys.forEach((k) => window.localStorage.removeItem(k));
                } catch {
                  // ignore
                }
                window.location.reload();
              }}
              style={{
                padding: "0.5rem 1rem",
                fontSize: "0.85rem",
                fontWeight: 500,
                color: "var(--color-text-secondary, #6b7280)",
                background: "transparent",
                border: "1px solid var(--color-border, #d1d5db)",
                borderRadius: "0.5rem",
                cursor: "pointer",
              }}
            >
              Очистить данные и обновить
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import React, { Component, ErrorInfo, ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (typeof window !== "undefined" && window.__debugLog) {
      window.__debugLog("ErrorBoundary", { error: error.message, stack: error.stack, componentStack: errorInfo.componentStack });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
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
          <p style={{ fontSize: "0.9rem", color: "var(--color-text-secondary, #6b7280)", marginBottom: "1.25rem", textAlign: "center", maxWidth: "20rem" }}>
            Произошла ошибка. Попробуйте обновить страницу.
          </p>
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
        </div>
      );
    }
    return this.props.children;
  }
}

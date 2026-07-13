import React from "react";
import { Typography } from "@maxhub/max-ui";

export function SyncDebugPanel({ debugRequest, debugResponse }: { debugRequest: string; debugResponse: string }) {
  if (!debugRequest && !debugResponse) return null;
  return (
    <div style={{ marginBottom: "0.75rem", padding: "0.55rem 0.65rem", borderRadius: 8, border: "1px dashed var(--color-border)", background: "var(--color-bg-hover)" }}>
      {debugRequest ? (
        <Typography.Body style={{ fontSize: "0.78rem", marginBottom: "0.35rem" }}>
          <strong>Запрос:</strong>
          <pre style={{ margin: "0.25rem 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.75rem" }}>{debugRequest}</pre>
        </Typography.Body>
      ) : null}
      {debugResponse ? (
        <Typography.Body style={{ fontSize: "0.78rem" }}>
          <strong>Ответ:</strong>
          <pre style={{ margin: "0.25rem 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.75rem" }}>{debugResponse}</pre>
        </Typography.Body>
      ) : null}
    </div>
  );
}

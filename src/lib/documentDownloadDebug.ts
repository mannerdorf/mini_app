/** Debug от /api/download (без полного base64). */
export type DocumentDownloadDebug = {
  ok: boolean;
  httpStatus: number;
  error?: string;
  message?: string;
  metod: string;
  number: string;
  dateDoc?: string;
  dateDog?: string;
  inn?: string;
  auth_mode?: "haulz" | "service" | string;
  upstream_url?: string;
  upstream_curl?: string;
  upstream_status?: number;
  upstream_content_type?: string;
  upstream_bytes?: number;
  upstream_response_summary?: string;
  access_check?: string;
  /** Клиентский POST /api/download (без пароля). */
  client_curl?: string;
  client_body?: Record<string, unknown>;
};

export function formatDocumentDownloadSandbox(debug: DocumentDownloadDebug): {
  curl: string;
  response: string;
  meta: string;
} {
  const curl = debug.upstream_curl || debug.client_curl || "—";
  const response = [
    `HTTP ${debug.upstream_status ?? debug.httpStatus}`,
    debug.upstream_content_type ? `Content-Type: ${debug.upstream_content_type}` : null,
    debug.upstream_bytes != null ? `Bytes: ${debug.upstream_bytes}` : null,
    debug.auth_mode ? `Auth: ${debug.auth_mode}` : null,
    debug.access_check ? `Access: ${debug.access_check}` : null,
    "",
    debug.upstream_response_summary || debug.message || debug.error || "—",
  ]
    .filter((line) => line != null)
    .join("\n");
  const meta = [
    `metod=${debug.metod}`,
    `Number=${debug.number}`,
    debug.dateDoc ? `DateDoc=${debug.dateDoc}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { curl, response, meta };
}

export function buildClientDownloadCurl(url: string, body: Record<string, unknown>): string {
  const safeBody = { ...body };
  if ("password" in safeBody) safeBody.password = "***";
  const json = JSON.stringify(safeBody);
  return [
    `curl --request POST \\`,
    `  --url '${url}' \\`,
    `  --header 'Content-Type: application/json' \\`,
    `  --data '${json.replace(/'/g, "'\\''")}'`,
  ].join("\n");
}

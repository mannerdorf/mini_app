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
  const curl = debug.upstream_curl || "—";
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

const GET_FILE_BASE = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetFile";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";
const HAULZ_AUTH = "Basic Info@haulz.pro:Y2ME42XyI_";
const HAULZ_METODS = new Set(["Договор", "Dogovor", "АктСверки", "AktSverki", "РеестрКсчету", "ЭР", "АПП"]);

/** Ожидаемый curl GetFile → 1С (даже если шлюз вернул 504 без debug). */
export function buildExpectedGetFileCurl(params: {
  metod: string;
  number: string;
  dateDoc?: string | null;
  dateDog?: string | null;
  inn?: string | null;
}): { url: string; curl: string; auth_mode: "haulz" | "service" } {
  const url = new URL(GET_FILE_BASE);
  url.searchParams.set("metod", params.metod);
  url.searchParams.set("Number", params.number);
  if (params.dateDoc) url.searchParams.set("DateDoc", params.dateDoc);
  if (params.dateDog) url.searchParams.set("DateDog", params.dateDog);
  if (params.inn) url.searchParams.set("INN", String(params.inn).trim());
  const auth_mode = HAULZ_METODS.has(params.metod) ? "haulz" : "service";
  const authHeader =
    auth_mode === "haulz" ? HAULZ_AUTH : "Basic <PEREVOZKI_SERVICE_LOGIN>:<PEREVOZKI_SERVICE_PASSWORD>";
  const curl = [
    `curl --location '${url.toString()}' \\`,
    `  --header 'Auth: ${authHeader}' \\`,
    `  --header 'Authorization: ${SERVICE_AUTH}' \\`,
    `  --header 'Accept: */*' \\`,
    `  --header 'Accept-Encoding: identity'`,
  ].join("\n");
  return { url: url.toString(), curl, auth_mode };
}

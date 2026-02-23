const GETAPI_BASE = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GETAPI";
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

function get1cSuperAdminCreds(): { login: string; password: string } | null {
  const login =
    process.env.ONE_C_SUPERADMIN_LOGIN?.trim()
    || process.env.SENDLK_SUPERADMIN_LOGIN?.trim()
    || process.env.ADMIN_LOGIN?.trim()
    || "";
  const password =
    process.env.ONE_C_SUPERADMIN_PASSWORD
    || process.env.SENDLK_SUPERADMIN_PASSWORD
    || process.env.ADMIN_PASSWORD
    || "";
  if (!login || !password) return null;
  return { login, password };
}

export async function sendLkAddTo1c(params: {
  inn: string;
  email: string;
}): Promise<{ ok: boolean; status?: number; responseText?: string; error?: string }> {
  const inn = String(params.inn || "").trim();
  const email = String(params.email || "").trim();
  if (!inn) return { ok: false, error: "INN is required" };
  if (!email) return { ok: false, error: "Email is required" };
  const creds = get1cSuperAdminCreds();
  if (!creds) return { ok: false, error: "1C superadmin credentials are not configured" };

  const url = new URL(GETAPI_BASE);
  url.searchParams.set("metod", "SendLK");
  url.searchParams.set("Operation", "add");
  url.searchParams.set("INN", inn);
  // По запросу пользователя передаем email как есть.
  url.searchParams.set("Email", email);

  try {
    const upstream = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: SERVICE_AUTH,
        Auth: `Basic ${creds.login}:${creds.password}`,
      },
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return { ok: false, status: upstream.status, responseText: text || upstream.statusText, error: text || upstream.statusText };
    }
    return { ok: true, status: upstream.status, responseText: text };
  } catch (e: unknown) {
    const err = e as Error;
    return { ok: false, error: err?.message || "1C request failed" };
  }
}


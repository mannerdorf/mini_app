/** Plan DELETE for POST /api/fcm-unsubscribe. Never wipe every device of a login. */

export type FcmUnsubscribePlan =
  | { ok: true; login: string; token: string }
  | { ok: false; error: string; status: number };

export function planFcmTokenUnsubscribe(body: {
  login?: unknown;
  token?: unknown;
}): FcmUnsubscribePlan {
  const login = String(body.login || "").trim().toLowerCase();
  const token = String(body.token || "").trim();
  if (!login) return { ok: false, error: "login is required", status: 400 };
  if (!token) {
    return {
      ok: false,
      error: "token is required — omitting it used to delete every FCM device for this login",
      status: 400,
    };
  }
  return { ok: true, login, token };
}

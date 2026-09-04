import { describe, expect, it } from "vitest";
import { planFcmTokenUnsubscribe } from "./fcmUnsubscribe.js";

describe("planFcmTokenUnsubscribe", () => {
  it("deletes only the given device token", () => {
    expect(
      planFcmTokenUnsubscribe({ login: " notification1@haulz.pro ", token: " android-fcm " }),
    ).toEqual({ ok: true, login: "notification1@haulz.pro", token: "android-fcm" });
  });

  it("rejects a missing login", () => {
    expect(planFcmTokenUnsubscribe({ token: "abc" })).toEqual({
      ok: false,
      error: "login is required",
      status: 400,
    });
  });

  it("refuses to delete every device when token is omitted (iOS WebView has no in-memory token)", () => {
    const plan = planFcmTokenUnsubscribe({ login: "notification1@haulz.pro" });
    expect(plan.ok).toBe(false);
    if (plan.ok) throw new Error("expected reject");
    expect(plan.status).toBe(400);
    expect(plan.error).toMatch(/token is required/i);
  });

  it("rejects blank token the same as omitted", () => {
    const plan = planFcmTokenUnsubscribe({ login: "a@b.c", token: "   " });
    expect(plan.ok).toBe(false);
  });
});

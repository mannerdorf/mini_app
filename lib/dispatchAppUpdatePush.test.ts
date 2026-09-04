import { describe, expect, it, vi, beforeEach } from "vitest";
import { dispatchAppUpdatePush } from "./dispatchAppUpdatePush.js";

function mockPool(state: {
  notified?: boolean;
  logins?: string[];
  prefs?: Record<string, Record<string, boolean>>;
}) {
  const queries: string[] = [];
  return {
    pool: {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push(sql);
        if (sql.includes("app_release_push_state") && sql.includes("SELECT")) {
          return { rows: state.notified ? [{ version_code: params?.[1] }] : [] };
        }
        if (sql.includes("fcm_device_tokens")) {
          return { rows: (state.logins || ["user@test"]).map((login) => ({ login })) };
        }
        if (sql.includes("notification_preferences_state")) {
          const logins = (params?.[0] as string[]) || [];
          return {
            rows: logins.map((login) => ({
              login,
              preferences: { push: state.prefs?.[login] || {} },
            })),
          };
        }
        if (sql.includes("push_notification_templates")) {
          return { rows: [] };
        }
        if (sql.includes("INSERT INTO app_release_push_state")) {
          return { rows: [] };
        }
        return { rows: [] };
      }),
    } as never,
    queries,
  };
}

vi.mock("../api/_lib/fcmDelivery.js", () => ({
  sendFcmToLogin: vi.fn(async () => ({ ok: true, sent: 1 })),
}));

describe("dispatchAppUpdatePush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips duplicate versionCode", async () => {
    const { pool } = mockPool({ notified: true });
    const result = await dispatchAppUpdatePush({
      pool,
      platform: "android",
      versionCode: 33,
      versionName: "1.3.28",
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("already_notified");
  });

  it("sends to users with app_update pref", async () => {
    const { pool } = mockPool({
      notified: false,
      logins: ["a@test", "b@test"],
      prefs: {
        "a@test": { app_update: true },
        "b@test": { app_update: false },
      },
    });
    const result = await dispatchAppUpdatePush({
      pool,
      platform: "android",
      versionCode: 34,
      versionName: "1.3.29",
    });
    expect(result.skipped).toBe(false);
    expect(result.recipientsTotal).toBe(1);
    expect(result.sent).toBe(1);
  });
});

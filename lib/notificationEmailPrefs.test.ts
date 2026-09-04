import { describe, expect, it } from "vitest";
import {
  applyPushPreferenceToggle,
  isLegacyImplicitDailySummaryOff,
  isPushNotificationEnabled,
  buildAllPushPreferencesEnabled,
  buildPushPreferencesSavePayload,
  mergePushPreferences,
  mergePushPreferencesForSave,
  pushPreferencesForClient,
  readPushSelectedInn,
  shouldSendDailySummaryPush,
} from "./notificationEmailPrefs.js";

describe("readPushSelectedInn", () => {
  it("reads plain INN strings", () => {
    expect(readPushSelectedInn("7722461620")).toBe("7722461620");
    expect(readPushSelectedInn("ИНН 7722 461620")).toBe("7722461620");
  });

  it("reads push_selected_inn from objects", () => {
    expect(readPushSelectedInn({ push_selected_inn: "7722461620" })).toBe("7722461620");
  });
});

describe("mergePushPreferences", () => {
  it("keeps cargo stages off when only bills were saved", () => {
    const merged = mergePushPreferences({
      bill_created: true,
      bill_paid: true,
      daily_summary: false,
    });
    expect(merged.received_at_warehouse).toBe(false);
    expect(merged.sent).toBe(false);
    expect(merged.daily_summary).toBe(true);
    expect(merged.bill_created).toBe(true);
  });

  it("keeps an explicit summary off after cargo toggles were used", () => {
    const merged = mergePushPreferences({
      sent: true,
      daily_summary: false,
    });
    expect(merged.daily_summary).toBe(false);
    expect(merged.sent).toBe(true);
  });
});

describe("mergePushPreferencesForSave", () => {
  it("keeps previously enabled stages when saving a new one without resending false defaults", () => {
    const saved = mergePushPreferencesForSave(
      { arrived: true, sent: true },
      { delivery_scheduled: true },
    );
    expect(saved.arrived).toBe(true);
    expect(saved.sent).toBe(true);
    expect(saved.delivery_scheduled).toBe(true);
  });

  it("turns off a stage only on explicit false", () => {
    const saved = mergePushPreferencesForSave(
      { arrived: true, delivery_scheduled: true },
      { arrived: false, delivery_scheduled: true },
    );
    expect(saved.arrived).toBeUndefined();
    expect(saved.delivery_scheduled).toBe(true);
  });

  it("does not wipe enabled stages when incoming carries false from UI defaults", () => {
    const saved = mergePushPreferencesForSave(
      { arrived: true },
      { arrived: false, delivery_scheduled: false, sent: false },
    );
    expect(saved.arrived).toBe(true);
    expect(saved.delivery_scheduled).toBeUndefined();
  });
});

describe("applyPushPreferenceToggle", () => {
  it("turns on arrived without wiping other enabled stages", () => {
    const saved = applyPushPreferenceToggle(
      { sent: true, loaded: true, arrived: false },
      "arrived",
      true,
    );
    expect(saved.sent).toBe(true);
    expect(saved.loaded).toBe(true);
    expect(saved.arrived).toBe(true);
  });

  it("turns on delivery_scheduled over legacy delivered=false", () => {
    const saved = applyPushPreferenceToggle(
      { sent: true, delivery_scheduled: false },
      "delivery_scheduled",
      true,
    );
    expect(saved.sent).toBe(true);
    expect(saved.delivery_scheduled).toBe(true);
  });

  it("turns off a single stage explicitly", () => {
    const saved = applyPushPreferenceToggle(
      { arrived: true, sent: true },
      "arrived",
      false,
    );
    expect(saved.arrived).toBeUndefined();
    expect(saved.sent).toBe(true);
  });

  it("stores granular delivered without legacy keys", () => {
    const saved = applyPushPreferenceToggle({ in_transit: true, delivered: true }, "delivered", true);
    expect(saved.delivered).toBe(true);
    expect(saved.in_transit).toBeUndefined();
    expect(saved.accepted).toBeUndefined();
  });

  it("forces delivered=true on enable even after legacy-shaped existing", () => {
    const saved = applyPushPreferenceToggle(
      { sent: true, delivery_scheduled: true, delivered: false },
      "delivered",
      true,
    );
    expect(saved.delivered).toBe(true);
    expect(saved.delivery_scheduled).toBe(true);
  });
});

describe("buildAllPushPreferencesEnabled", () => {
  it("enables every push event including cargo stages", () => {
    const all = buildAllPushPreferencesEnabled();
    expect(all.sent).toBe(true);
    expect(all.delivered).toBe(true);
    expect(all.bill_created).toBe(true);
    expect(all.daily_summary).toBe(true);
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(12);
  });
});

describe("buildPushPreferencesSavePayload", () => {
  it("sends only enabled cargo keys plus touched toggle", () => {
    expect(
      buildPushPreferencesSavePayload(
        { arrived: true, sent: false, delivery_scheduled: false, bill_created: true },
        { eventId: "delivery_scheduled", value: true },
      ),
    ).toEqual({
      arrived: true,
      delivery_scheduled: true,
      bill_created: true,
    });
  });
});

describe("pushPreferencesForClient", () => {
  it("applies defaults for unset keys on read", () => {
    const client = pushPreferencesForClient({ sent: true, arrived: true, delivery_scheduled: true });
    expect(client.sent).toBe(true);
    expect(client.arrived).toBe(true);
    expect(client.delivery_scheduled).toBe(true);
    expect(client.info_received).toBe(false);
    expect(client.bill_created).toBe(true);
  });

  it("keeps granular delivered stage on read (not legacy coarse flag)", () => {
    const client = pushPreferencesForClient({ delivered: true });
    expect(client.delivered).toBe(true);
    expect(client.delivery_scheduled).toBe(false);
  });

  it("keeps explicit delivered=false on read", () => {
    const client = pushPreferencesForClient({ sent: true, delivered: false });
    expect(client.delivered).toBe(false);
    expect(client.sent).toBe(true);
  });

  it("keeps delivery_scheduled and delivered together on read", () => {
    const client = pushPreferencesForClient({
      sent: true,
      delivery_scheduled: true,
      delivered: true,
    });
    expect(client.delivery_scheduled).toBe(true);
    expect(client.delivered).toBe(true);
  });

  it("expands legacy coarse delivered with in_transit", () => {
    const client = pushPreferencesForClient({ in_transit: true, delivered: true });
    expect(client.delivery_scheduled).toBe(true);
    expect(client.delivered).toBe(true);
    expect(client.sent).toBe(true);
  });
});

describe("isLegacyImplicitDailySummaryOff", () => {
  it("detects the old default persisted with invoice toggles only", () => {
    expect(
      isLegacyImplicitDailySummaryOff({ bill_created: true, daily_summary: false }),
    ).toBe(true);
    expect(isLegacyImplicitDailySummaryOff({ sent: false, daily_summary: false })).toBe(false);
  });
});

describe("isPushNotificationEnabled", () => {
  it("defaults unset cargo stages to off", () => {
    expect(isPushNotificationEnabled({ bill_created: true }, "sent")).toBe(false);
    expect(isPushNotificationEnabled({ sent: false }, "sent")).toBe(false);
    expect(isPushNotificationEnabled({ sent: true }, "sent")).toBe(true);
  });

  it("keeps bills and daily summary on by default", () => {
    expect(isPushNotificationEnabled({}, "bill_created")).toBe(true);
    expect(isPushNotificationEnabled({}, "daily_summary")).toBe(true);
    expect(isPushNotificationEnabled({}, "planned_delivery_date")).toBe(true);
    expect(isPushNotificationEnabled({}, "app_update")).toBe(true);
    expect(isPushNotificationEnabled({ bill_created: false }, "bill_created")).toBe(false);
  });
});

describe("shouldSendDailySummaryPush", () => {
  it("sends when the user enabled the summary", () => {
    expect(shouldSendDailySummaryPush({ daily_summary: true })).toBe(true);
  });

  it("sends for the old implicit false saved with invoice prefs only", () => {
    expect(shouldSendDailySummaryPush({ bill_created: true, daily_summary: false })).toBe(true);
  });

  it("respects an explicit off after cargo prefs were set", () => {
    expect(shouldSendDailySummaryPush({ sent: true, daily_summary: false })).toBe(false);
  });
});

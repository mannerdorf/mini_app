import { describe, expect, it } from "vitest";
import {
  isLegacyImplicitDailySummaryOff,
  isPushNotificationEnabled,
  mergePushPreferences,
  shouldSendDailySummaryPush,
} from "./notificationEmailPrefs.js";

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

import { describe, expect, it } from "vitest";
import { fcmPlatformFromCapacitor, hasStoredNativeFcmToken, NATIVE_PUSH_CLIENT_MARK } from "./androidPushNotifications";

describe("fcmPlatformFromCapacitor", () => {
  it("maps Capacitor iOS to FCM platform ios", () => {
    expect(fcmPlatformFromCapacitor("ios")).toBe("ios");
  });

  it("maps Capacitor Android to FCM platform android", () => {
    expect(fcmPlatformFromCapacitor("android")).toBe("android");
  });

  it("falls back to android for unknown native platforms", () => {
    expect(fcmPlatformFromCapacitor("web")).toBe("android");
    expect(fcmPlatformFromCapacitor("")).toBe("android");
  });
});

describe("hasStoredNativeFcmToken", () => {
  it("is false when this device has not persisted an FCM token", () => {
    expect(hasStoredNativeFcmToken("notification1@haulz.pro")).toBe(false);
  });
});

describe("NATIVE_PUSH_CLIENT_MARK", () => {
  it("identifies the TestFlight JS that actually waits for an FCM token", () => {
    expect(NATIVE_PUSH_CLIENT_MARK).toBe("push-js 10");
  });
});


import { describe, expect, it } from "vitest";
import { fcmPlatformFromCapacitor } from "./androidPushNotifications";

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

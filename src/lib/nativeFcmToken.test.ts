import { describe, expect, it } from "vitest";
import {
  fcmRegistrationErrorMessage,
  nativeFcmUnsubscribePayload,
  parseStoredNativeFcmToken,
  serializeStoredNativeFcmToken,
} from "./nativeFcmToken";

describe("nativeFcmUnsubscribePayload", () => {
  it("returns login+token for this device only", () => {
    expect(nativeFcmUnsubscribePayload(" notification1@haulz.pro ", "ios-fcm")).toEqual({
      login: "notification1@haulz.pro",
      token: "ios-fcm",
    });
  });

  it("returns null without a token so Android devices of the same login stay subscribed", () => {
    expect(nativeFcmUnsubscribePayload("notification1@haulz.pro", "")).toBeNull();
    expect(nativeFcmUnsubscribePayload("notification1@haulz.pro", null)).toBeNull();
    expect(nativeFcmUnsubscribePayload("notification1@haulz.pro", undefined)).toBeNull();
  });

  it("returns null without a login", () => {
    expect(nativeFcmUnsubscribePayload("", "ios-fcm")).toBeNull();
  });
});

describe("fcmRegistrationErrorMessage", () => {
  it("passes through the native Firebase/plist error", () => {
    expect(
      fcmRegistrationErrorMessage({ error: "GoogleService-Info.plist отсутствует — FCM на iOS не настроен." }),
    ).toMatch(/GoogleService-Info/);
  });

  it("explains a missing token when native error is empty", () => {
    expect(fcmRegistrationErrorMessage(undefined)).toMatch(/FCM-токен/);
  });
});

describe("stored native FCM token", () => {
  it("round-trips token for the same login", () => {
    const raw = serializeStoredNativeFcmToken("notification1@haulz.pro", "ios-fcm", "ios");
    expect(parseStoredNativeFcmToken(raw, "NOTIFICATION1@haulz.pro")).toBe("ios-fcm");
  });

  it("ignores a token stored for another login", () => {
    const raw = serializeStoredNativeFcmToken("other@haulz.pro", "ios-fcm", "ios");
    expect(parseStoredNativeFcmToken(raw, "notification1@haulz.pro")).toBe("");
  });

  it("ignores invalid JSON", () => {
    expect(parseStoredNativeFcmToken("not-json", "a@b.c")).toBe("");
    expect(parseStoredNativeFcmToken(null, "a@b.c")).toBe("");
  });
});

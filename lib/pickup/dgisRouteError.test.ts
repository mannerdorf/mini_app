import { describe, expect, it } from "vitest";
import {
  DgisRouteError,
  dgisErrorMessage,
  sanitizeDgisDebugPayload,
} from "./dgisRouteError";

describe("sanitizeDgisDebugPayload", () => {
  it("redacts api keys in strings and objects", () => {
    expect(
      sanitizeDgisDebugPayload({
        url: "https://routing.api.2gis.com?key=secret123&x=1",
        key: "secret123",
      }),
    ).toEqual({
      url: "https://routing.api.2gis.com?key=***&x=1",
      key: "***",
    });
  });
});

describe("dgisErrorMessage", () => {
  it("reads nested error.message", () => {
    expect(
      dgisErrorMessage({ error: { message: "Invalid truck mass" } }),
    ).toBe("Invalid truck mass");
  });
});

describe("DgisRouteError", () => {
  it("carries debug entry", () => {
    const err = new DgisRouteError("fail", {
      service: "routing",
      httpStatus: 400,
      responseBody: { error: { message: "x" } },
    });
    expect(err.debug.httpStatus).toBe(400);
  });
});

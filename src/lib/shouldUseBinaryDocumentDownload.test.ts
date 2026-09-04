import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isMiniAppWebView, shouldUseBinaryDocumentDownload } from "./shouldUseBinaryDocumentDownload";

describe("shouldUseBinaryDocumentDownload", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { protocol: "https:" },
      Capacitor: { isNativePlatform: () => false },
      navigator: { userAgent: "Mozilla/5.0" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true for MAX WebView", () => {
    vi.stubGlobal("window", {
      location: { protocol: "https:" },
      Capacitor: { isNativePlatform: () => false },
      navigator: { userAgent: "MAX/1.0" },
      WebApp: {},
    });
    expect(shouldUseBinaryDocumentDownload()).toBe(true);
  });

  it("returns true for Capacitor native", () => {
    vi.stubGlobal("window", {
      location: { protocol: "capacitor:" },
      Capacitor: { isNativePlatform: () => true },
      navigator: { userAgent: "Mozilla/5.0" },
    });
    expect(shouldUseBinaryDocumentDownload()).toBe(true);
  });

  it("returns false for desktop browser", () => {
    expect(shouldUseBinaryDocumentDownload()).toBe(false);
    expect(isMiniAppWebView()).toBe(false);
  });
});

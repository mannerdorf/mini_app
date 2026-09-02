import { describe, expect, it, vi, afterEach } from "vitest";
import { resolveApiOrigin } from "./resolveApiOrigin";

describe("resolveApiOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses VITE_API_ORIGIN on Capacitor, including haulz.space", () => {
    vi.stubEnv("VITE_API_ORIGIN", "https://haulz.space");
    vi.stubGlobal("window", {
      location: { origin: "capacitor://localhost", protocol: "capacitor:" },
      Capacitor: { isNativePlatform: () => true },
    });
    expect(resolveApiOrigin()).toBe("https://haulz.space");
  });

  it("allows custom non-front API origin on Capacitor (staging)", () => {
    vi.stubEnv("VITE_API_ORIGIN", "http://localhost:3000");
    vi.stubGlobal("window", {
      location: { origin: "capacitor://localhost", protocol: "capacitor:" },
      Capacitor: { isNativePlatform: () => true },
    });
    expect(resolveApiOrigin()).toBe("http://localhost:3000");
  });

  it("uses same-origin on haulz.space in browser", () => {
    vi.stubEnv("VITE_API_ORIGIN", "");
    vi.stubGlobal("window", {
      location: { origin: "https://haulz.space", protocol: "https:", hostname: "haulz.space" },
      Capacitor: { isNativePlatform: () => false },
    });
    expect(resolveApiOrigin()).toBe("https://haulz.space");
  });
});

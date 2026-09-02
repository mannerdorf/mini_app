import { describe, expect, it, vi, afterEach } from "vitest";
import { resolveApiOrigin } from "./resolveApiOrigin";

describe("resolveApiOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rewrites baked-in haulz.space to api.haulz.space on Capacitor", () => {
    vi.stubEnv("VITE_API_ORIGIN", "https://haulz.space");
    vi.stubGlobal("window", {
      location: { origin: "capacitor://localhost", protocol: "capacitor:" },
      Capacitor: { isNativePlatform: () => true },
    });
    expect(resolveApiOrigin()).toBe("https://api.haulz.space");
  });

  it("allows custom non-front API origin on Capacitor (staging)", () => {
    vi.stubEnv("VITE_API_ORIGIN", "http://localhost:3000");
    vi.stubGlobal("window", {
      location: { origin: "capacitor://localhost", protocol: "capacitor:" },
      Capacitor: { isNativePlatform: () => true },
    });
    expect(resolveApiOrigin()).toBe("http://localhost:3000");
  });

  it("uses api.haulz.space from the haulz.space browser (avoids POST 301 → 405)", () => {
    vi.stubEnv("VITE_API_ORIGIN", "");
    vi.stubGlobal("window", {
      location: { origin: "https://haulz.space", protocol: "https:", hostname: "haulz.space" },
      Capacitor: { isNativePlatform: () => false },
    });
    expect(resolveApiOrigin()).toBe("https://api.haulz.space");
  });
});

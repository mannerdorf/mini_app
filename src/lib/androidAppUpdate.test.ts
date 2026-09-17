import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) },
  CapacitorHttp: { get: vi.fn() },
}));
vi.mock("./clientPlatform", () => ({ getClientPlatform: vi.fn() }));
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { fetchAndroidReleaseManifest } from "./androidAppUpdate";

const manifest = { versionCode: 43, versionName: "1.3.38", apkUrl: "https://example.invalid/app.apk" };
beforeEach(() => { vi.useFakeTimers(); vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("release manifest deadline", () => {
  it("aborts a stalled web request and permits a successful retry", async () => {
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce({ ok: true, json: async () => manifest });
    vi.stubGlobal("fetch", fetcher);
    const pending = fetchAndroidReleaseManifest();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeNull();
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    expect(await fetchAndroidReleaseManifest()).toEqual(manifest);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("also bounds a stalled response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) }));
    const pending = fetchAndroidReleaseManifest();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeNull();
  });
  it("bounds the native bridge and ignores late completion", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    let finish!: (value: never) => void;
    vi.mocked(CapacitorHttp.get).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = fetchAndroidReleaseManifest();
    expect(CapacitorHttp.get).toHaveBeenCalledWith(expect.objectContaining({ connectTimeout: 10_000, readTimeout: 10_000 }));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeNull();
    finish({ status: 200, data: manifest } as never);
    await Promise.resolve();
    expect(await pending).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cleans up after success and malformed JSON", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(CapacitorHttp.get).mockResolvedValueOnce({ status: 200, data: JSON.stringify(manifest) } as never)
      .mockResolvedValueOnce({ status: 200, data: "invalid" } as never);
    expect(await fetchAndroidReleaseManifest()).toEqual(manifest);
    expect(vi.getTimerCount()).toBe(0);
    expect(await fetchAndroidReleaseManifest()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

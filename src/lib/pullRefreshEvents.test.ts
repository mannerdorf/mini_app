import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { dispatchPullRefresh, HAULZ_PULL_REFRESH_EVENT } from "./pullRefreshEvents";

describe("pullRefreshEvents", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches haulz-pull-refresh custom event", () => {
    dispatchPullRefresh();
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
    const event = (window.dispatchEvent as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as CustomEvent;
    expect(event.type).toBe(HAULZ_PULL_REFRESH_EVENT);
  });
});

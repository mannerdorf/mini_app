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

  it("dispatches date-filter sync then haulz-pull-refresh", () => {
    dispatchPullRefresh();
    expect(window.dispatchEvent).toHaveBeenCalledTimes(2);
    const syncEvent = (window.dispatchEvent as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as CustomEvent;
    const pullEvent = (window.dispatchEvent as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as CustomEvent;
    expect(syncEvent.type).toBe("haulz-date-filter-sync");
    expect(pullEvent.type).toBe(HAULZ_PULL_REFRESH_EVENT);
  });
});

import { it, expect, vi, afterEach } from "vitest";
import { startLocationTracking } from "./locationTracking";
afterEach(() => vi.useRealTimers());
function harness() {
  vi.useFakeTimers();
  const document = {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const call = vi
    .fn()
    .mockResolvedValue({
      accepted: true,
      measured_at: new Date().toISOString(),
    });
  const geolocation = { getCurrentPosition: vi.fn() };
  const onState = vi.fn(),
    onDenied = vi.fn();
  const stop = startLocationTracking({
    routeId: "route",
    call,
    geolocation,
    document: document as any,
    onState,
    onDenied,
  });
  const fix = () => ({
    timestamp: Date.now(),
    coords: { latitude: 55.7, longitude: 37.6, accuracy: 15 },
  });
  return { document, call, geolocation, onState, onDenied, stop, fix };
}
it("sends fresh fixes periodically only in foreground and stops on teardown", async () => {
  const h = harness();
  await h.geolocation.getCurrentPosition.mock.calls[0][0](h.fix());
  expect(h.call.mock.calls[0][0]).toMatchObject({
    action: "location",
    id: "route",
    latitude: 55.7,
  });
  expect(h.call.mock.calls[0][0].requestId).toBeUndefined();
  h.document.visibilityState = "hidden";
  await vi.advanceTimersByTimeAsync(600000);
  expect(h.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  h.document.visibilityState = "visible";
  h.document.addEventListener.mock.calls[0][1]();
  expect(h.geolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
  h.stop();
  await h.geolocation.getCurrentPosition.mock.calls[1][0](h.fix());
  await vi.advanceTimersByTimeAsync(600000);
  expect(h.call).toHaveBeenCalledTimes(1);
  expect(h.document.removeEventListener).toHaveBeenCalled();
});
it("stops on denied permission without sending a location", async () => {
  const h = harness();
  h.geolocation.getCurrentPosition.mock.calls[0][1]({ code: 1 });
  await vi.advanceTimersByTimeAsync(600000);
  expect(h.call).not.toHaveBeenCalled();
  expect(h.onDenied).toHaveBeenCalledTimes(1);
  expect(h.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  h.stop();
});
it("does not queue or resend the previous fix after a network error", async () => {
  const h = harness();
  h.call.mockRejectedValueOnce(new TypeError("offline"));
  await h.geolocation.getCurrentPosition.mock.calls[0][0](h.fix());
  expect(h.onState.mock.lastCall?.[0].status).toBe("error");
  await vi.advanceTimersByTimeAsync(300000);
  expect(h.geolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
  expect(h.call).toHaveBeenCalledTimes(1);
  await h.geolocation.getCurrentPosition.mock.calls[1][0](h.fix());
  expect(h.call).toHaveBeenCalledTimes(2);
  h.stop();
});

it("requests a new position at five minutes, not before", async () => {
  const h = harness();
  await h.geolocation.getCurrentPosition.mock.calls[0][0](h.fix());
  await vi.advanceTimersByTimeAsync(299999);
  expect(h.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(h.geolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
  h.stop();
});

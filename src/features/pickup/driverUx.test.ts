import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("../../lib/appVersionInfo", () => ({ getAppVersionSnapshot: vi.fn(), checkAppReleaseUpdate: vi.fn(), reloadWebApp: vi.fn(), openAndroidReleaseDownload: vi.fn() }));
vi.mock("./PickupRouteComparisonMap", () => ({ PickupRouteComparisonMap: () => null }));
import { getAppVersionSnapshot, reloadWebApp } from "../../lib/appVersionInfo";
import { DriverHome, DriverProfile } from "./PickupDriverNavigation";
import { PickupRouteCheck } from "./PickupRouteCheck";
let root: ReturnType<typeof create> | undefined;
afterEach(() => { act(() => root?.unmount()); root = undefined; vi.clearAllMocks(); });
const text = () => JSON.stringify(root!.toJSON());

it("shows current profile without a route and does not reload native iOS", async () => {
  vi.mocked(getAppVersionSnapshot).mockResolvedValue({ platform: { source: "capacitor", platform: "ios" }, install: { versionName: "1", buildNumber: 117 } } as never);
  await act(async () => { root = create(React.createElement(DriverProfile, { account: { login: "driver" } as never, blocked: false, profile: { name: "Иван", phone: "123", phoneExtra: "", carrier: "" } })); });
  expect(text()).toContain("Иван");
  expect(text()).toContain("Как обновить iOS");
  await act(async () => { await root!.root.findAllByType("button")[0].props.onClick(); });
  expect(text()).toContain("TestFlight");
  expect(reloadWebApp).not.toHaveBeenCalled();
});
it("shows timestamp, queued marks and an authorization error instead of no routes", () => {
  act(() => { root = create(React.createElement(DriverHome, { routes: [], jobs: [], date: "2026-09-17", today: "2026-09-17", loading: false, stale: true, pending: 2, syncedAt: "2026-09-17T10:00:00Z", error: "Нет доступа", onToday: () => {}, onRoute: () => {} })); });
  expect(text()).toContain("Нет доступа");
  expect(text()).toContain("Синхронизация:");
  expect(text()).toContain("Ожидают отправки: 2");
  expect(text()).not.toContain("Назначенных рейсов пока нет");
});
it("requires explicit window confirmation and resets it when the route changes", async () => {
  const call = vi.fn(async () => ({ status: "gray", warnings: [], checkedAt: new Date().toISOString() }));
  const props = { route: { id: "r", version: 1, status: "draft" }, jobs: [], snapshot: { resources: [] }, call, busy: false, stale: false, onApply: async () => true } as any;
  act(() => { root = create(React.createElement(PickupRouteCheck, props), { createNodeMock: () => ({ showModal() {} }) }); });
  act(() => root!.root.findAllByType("button")[0].props.onClick());
  const calculate = () => root!.root.findAllByType("button").find(b => b.props.className === "pk-primary")!;
  await act(async () => { calculate().props.onClick(); });
  expect(call).toHaveBeenLastCalledWith(expect.objectContaining({ windowsConfirmed: false }));
  act(() => root!.root.findByType("input").props.onChange({ target: { checked: true } }));
  await act(async () => { calculate().props.onClick(); });
  expect(call).toHaveBeenLastCalledWith(expect.objectContaining({ windowsConfirmed: true }));
  act(() => root!.update(React.createElement(PickupRouteCheck, { ...props, route: { ...props.route, version: 2 } })));
  expect(root!.root.findByType("input").props.checked).toBe(false);
});

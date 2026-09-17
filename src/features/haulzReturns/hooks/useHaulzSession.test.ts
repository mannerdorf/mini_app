import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../../../api/client/haulzReturns", () => ({
  deleteHaulzReturnsJob: vi.fn(), getHaulzReturnsJob: vi.fn(), listHaulzReturnsJobs: vi.fn(async () => []),
  processHaulzReturnsJob: vi.fn(), renameHaulzReturnsJob: vi.fn(), saveHaulzReturnsWorkbook: vi.fn(),
}));
vi.mock("../../../lib/haulzReturns", () => ({ applyWorkbookTdMeta: (_: unknown, wb: unknown) => wb, normalizeWorkbookColumns: (wb: unknown) => wb }));
vi.mock("../haulzReturnsPageUtils", () => ({ haulzJobDisplayTitle: () => "" }));
import { getHaulzReturnsJob } from "../../../api/client/haulzReturns";
import { useHaulzSession } from "./useHaulzSession";

const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; };
const data = (id: string) => ({ files: [{ id }], workbook: { id }, job: {} });
let root: ReturnType<typeof create>;
let session: ReturnType<typeof useHaulzSession>;
const setters = Object.fromEntries(["setOtpravkaFile", "setUlPrio1", "setUlPrio2", "setWorkbook", "setActiveTab", "setWorkbookTableCollapsed", "setTdPanelOpen", "setError", "setProcessing"].map(key => [key, vi.fn()]));
const hydrate = vi.fn(async (wb: any) => wb);
function Harness({ login = "alice" }) {
  const auth = React.useMemo(() => ({ login, password: "test" }), [login]);
  session = useHaulzSession({ auth, setters: setters as never, hydrateDeferredItogSheet: hydrate, otpravkaFile: null, workbook: null });
  return null;
}
beforeEach(async () => {
  vi.clearAllMocks(); hydrate.mockImplementation(async wb => wb);
  await act(async () => { root = create(React.createElement(Harness)); });
});
afterEach(() => act(() => root.unmount()));

it("ignores response A after session B has loaded", async () => {
  const a = deferred();
  vi.mocked(getHaulzReturnsJob).mockImplementation(async (_auth, id) => id === "A" ? a.promise : data(id) as never);
  let first!: Promise<void>;
  await act(async () => { first = session.loadJob("A"); });
  await act(async () => { await session.loadJob("B"); });
  await act(async () => { a.resolve(data("A")); await first; });
  expect(session.jobId).toBe("B");
  expect(session.storedFiles[0].id).toBe("B");
  expect(setters.setWorkbook).toHaveBeenLastCalledWith({ id: "B" });
});
it("ignores old hydration after switching account", async () => {
  const a = deferred();
  vi.mocked(getHaulzReturnsJob).mockResolvedValue(data("A") as never);
  hydrate.mockImplementationOnce(() => a.promise);
  let first!: Promise<void>;
  await act(async () => { first = session.loadJob("A"); });
  await act(async () => { root.update(React.createElement(Harness, { login: "bob" })); });
  await act(async () => { a.resolve({ id: "A" }); await first; });
  expect(session.jobId).toBeNull();
  expect(session.storedFiles).toEqual([]);
  expect(setters.setWorkbook).toHaveBeenLastCalledWith(null);
});
it("invalidates a pending load when starting a new upload", async () => {
  const a = deferred();
  vi.mocked(getHaulzReturnsJob).mockReturnValue(a.promise);
  let first!: Promise<void>;
  await act(async () => { first = session.loadJob("A"); });
  act(() => session.setJobId("new-upload"));
  await act(async () => { a.resolve(data("A")); await first; });
  expect(session.jobId).toBe("new-upload");
  expect(session.storedFiles).toEqual([]);
});

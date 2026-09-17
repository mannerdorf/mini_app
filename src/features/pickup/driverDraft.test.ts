import { describe, expect, it, vi } from "vitest";
vi.mock("./client", () => ({ cacheRead: vi.fn(), cacheWrite: vi.fn() }));
import { createDriverDraftStore, draftKey, updateDriverDraft, type DriverDraft } from "./driverDraft";
const draft: DriverDraft = { actual: "3", note: "Хрупкое", photos: ["data:image/jpeg;base64,test"], version: 7, step: "pickup_confirm" };

describe("driver draft revision", () => {
  const empty: DriverDraft = { actual: "", note: "", photos: [], version: 1, step: "arrive" };
  it("adopts the arrived revision before the first quantity is entered", () => {
    const arrived = updateDriverDraft(empty, 2, "step", "pickup_places");
    const entered = updateDriverDraft(arrived, 2, "actual", "3");
    expect(entered).toMatchObject({ version: 2, actual: "3", step: "pickup_places" });
  });
  it("adopts the visible revision even when input precedes the step effect", () => {
    expect(updateDriverDraft(empty, 2, "actual", "3").version).toBe(2);
  });
  it.each([
    { ...empty, actual: "0" },
    { ...empty, note: "Позвонить" },
    { ...empty, photos: ["photo"] },
  ])("retains a populated draft revision after an external update", populated => {
    const next = updateDriverDraft(populated, 2, "step", "pickup_confirm");
    expect(next.version).toBe(1);
    expect(next).toMatchObject({ actual: populated.actual, note: populated.note, photos: populated.photos });
    expect(updateDriverDraft(next, 2, "version", 2).version).toBe(2);
  });
});

describe("driver draft storage", () => {
  it("isolates drivers and jobs while retaining the same draft key across revisions", () => {
    expect(draftKey(" DRIVER ", "job")).toBe(draftKey("driver", "job"));
    expect(draftKey("driver", "job")).not.toBe(draftKey("another", "job"));
    expect(draftKey("driver", "job")).not.toBe(draftKey("driver", "another"));
  });
  it("restores all fields after a new store is created", async () => {
    const disk = new Map<string, DriverDraft | undefined>();
    const read = async (key: string) => disk.get(key);
    const write = async (key: string, value: unknown) => { disk.set(key, structuredClone(value) as DriverDraft); };
    await createDriverDraftStore(read, write).write("key", draft);
    expect(await createDriverDraftStore(read, write).read("key")).toEqual(draft);
  });
  it("waits for a pending photo write before clearing the submitted draft", async () => {
    let finish!: () => void;
    const slow = new Promise<void>(resolve => { finish = resolve; });
    const disk = new Map<string, DriverDraft | undefined>();
    const write = vi.fn(async (key: string, value: unknown) => { if (value) await slow; disk.set(key, value as DriverDraft | undefined); });
    const store = createDriverDraftStore(async key => disk.get(key), write);
    const saving = store.write("key", draft);
    const clearing = store.write("key", undefined);
    await Promise.resolve();
    finish();
    await Promise.all([saving, clearing]);
    expect(await store.read("key")).toBeUndefined();
    expect(write.mock.calls.map(call => call[1])).toEqual([draft, undefined]);
  });
  it("allows retry after storage failure instead of poisoning the write queue", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("quota")).mockResolvedValueOnce(undefined);
    const store = createDriverDraftStore(async () => undefined, write);
    await expect(store.write("key", draft)).rejects.toThrow("quota");
    await expect(store.write("key", { ...draft, note: "retry" })).resolves.toBeUndefined();
    expect(write).toHaveBeenCalledTimes(2);
  });
});

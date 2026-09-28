import { describe, expect, it } from "vitest";
import { jobTimeline } from "./jobTimeline";
describe("pickup timeline", () => {
  it("keeps manual repeated transitions and sorts by event time", () => {
    const rows = jobTimeline({ createdAt: "2026-09-01T08:00:00Z", status: "deposited", events: [
      { id: "b", action: "Статус забора изменён диспетчером", created_at: "2026-09-01T10:00:00Z", data: { to: "deposited" } },
      { id: "a", action: "Груз забран", created_at: "2026-09-01T09:00:00Z", data: { to: "partial", note: "Не весь груз" } },
    ] });
    expect(rows.map((r) => r.label)).toEqual(["Создан · Ожидает забора", "Частичный забор", "Сдан на склад"]);
    expect(rows[1].note).toBe("Не весь груз");
  });
  it("does not invent a deposit timestamp when old audit events are missing", () => {
    expect(jobTimeline({ createdAt: "2026-09-01T08:00:00Z", status: "deposited", events: [] })).toHaveLength(1);
  });
  it("supports old events without status fields and skips billing changes", () => {
    const rows = jobTimeline({ createdAt: "2026-09-01T08:00:00Z", status: "arrived", events: [
      { id: "a", action: "Прибыл на точку", created_at: "2026-09-01T09:00:00Z" },
      { id: "b", action: "Расчёты изменены диспетчером", created_at: "2026-09-01T10:00:00Z" },
    ] });
    expect(rows.map((r) => r.label)).toEqual(["Создан · Ожидает забора", "На точке"]);
  });
});

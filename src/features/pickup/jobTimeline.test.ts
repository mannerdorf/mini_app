import { describe, expect, it } from "vitest";
import { jobTimeline } from "./jobTimeline";
describe("pickup timeline", () => {
  it("starts at arrival and excludes earlier statuses", () => {
    const rows = jobTimeline({ createdAt: "2026-09-01T08:00:00Z", status: "picked_up", events: [
      { id: "a", action: "Статус забора изменён диспетчером", created_at: "2026-09-01T08:30:00Z", data: { to: "pending" } },
      { id: "b", action: "Прибыл на точку", created_at: "2026-09-01T09:00:00Z", data: { to: "arrived" } },
      { id: "c", action: "Груз забран", created_at: "2026-09-01T10:00:00Z", data: { to: "picked_up" } },
    ] });
    expect(rows.map((r) => r.label)).toEqual(["На точке", "Груз забран"]);
  });
  it("keeps manual repeated transitions and sorts by event time", () => {
    const rows = jobTimeline({ createdAt: "2026-09-01T08:00:00Z", status: "deposited", events: [
      { id: "b", action: "Статус забора изменён диспетчером", created_at: "2026-09-01T10:00:00Z", data: { to: "deposited" } },
      { id: "a", action: "Груз забран", created_at: "2026-09-01T09:00:00Z", data: { to: "partial", note: "Не весь груз" } },
    ] });
    expect(rows.map((r) => r.label)).toEqual(["Частичный забор", "Сдан на склад · изменено диспетчером"]);
    expect(rows[0].note).toBe("Не весь груз");
  });
  it("does not invent a deposit timestamp when old audit events are missing", () => {
    expect(jobTimeline({ createdAt: "2026-09-01T08:00:00Z", status: "deposited", events: [] })).toHaveLength(0);
  });
  it("supports old events without status fields and skips billing changes", () => {
    const rows = jobTimeline({ createdAt: "2026-09-01T08:00:00Z", status: "arrived", events: [
      { id: "a", action: "Прибыл на точку", created_at: "2026-09-01T09:00:00Z" },
      { id: "b", action: "Расчёты изменены диспетчером", created_at: "2026-09-01T10:00:00Z" },
    ] });
    expect(rows.map((r) => r.label)).toEqual(["На точке"]);
  });
});

it("does not turn dispatcher comments into later partial pickup statuses", () => {
  const rows = jobTimeline({createdAt:"2026-09-28T03:15:53Z",status:"partial",events:[
    {id:"pickup",action:"Груз забран",created_at:"2026-09-28T04:30:49Z"},
    {id:"comment",action:"Решение диспетчера",created_at:"2026-09-28T22:58:48Z",data:{from:"partial",to:"partial",note:"ок"}},
    {id:"edit",action:"set_job_status",created_at:"2026-09-28T23:00:00Z",data:{from:"partial",to:"partial"}}
  ]});
  expect(rows.map(row=>row.label)).toEqual(["Груз забран"]);
});

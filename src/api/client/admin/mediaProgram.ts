import { adminAuthHeaders } from "./auth";
import type { ProgramChannelPatch, ProgramDashboard, ProgramTaskPatch } from "../../../../lib/mediaMarketing/programTypes";

type Revision = { expected_updated_at?: string | null };
async function parseDashboard(response: Response): Promise<ProgramDashboard> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data?.error || response.statusText));
  if (!data || typeof data.storage_ready !== "boolean" || !Array.isArray(data.tasks)
    || !Array.isArray(data.channels) || !Array.isArray(data.activity) || !Array.isArray(data.metrics)) {
    throw new Error("API программы вернул неожиданный ответ. Проверьте, что backend обновлён, и повторите загрузку.");
  }
  return data as ProgramDashboard;
}

export async function fetchMediaProgram(adminToken: string): Promise<ProgramDashboard> {
  return parseDashboard(await fetch("/api/admin-media-program", { headers: adminAuthHeaders(adminToken), cache: "no-store" }));
}

async function patchMediaProgram(adminToken: string, payload: ({ entity: "task" } & ProgramTaskPatch & Revision) | ({ entity: "channel" } & ProgramChannelPatch & Revision)): Promise<ProgramDashboard> {
  return parseDashboard(await fetch("/api/admin-media-program", {
    method: "PATCH", headers: { ...adminAuthHeaders(adminToken), "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }));
}

export function patchMediaProgramTask(adminToken: string, payload: ProgramTaskPatch & Revision): Promise<ProgramDashboard> {
  return patchMediaProgram(adminToken, { ...payload, entity: "task" });
}

export function patchMediaProgramChannel(adminToken: string, payload: ProgramChannelPatch & Revision): Promise<ProgramDashboard> {
  return patchMediaProgram(adminToken, { ...payload, entity: "channel" });
}

import { adminAuthHeaders } from "./auth";
import type { FivepostRoute } from "../../../../lib/fivepost/types";

export type FivepostBatchSummary = {
  id: number;
  login: string;
  filename: string;
  route: FivepostRoute;
  status: string;
  rowCount: number;
  translatedCount: number;
  createdAt: string;
};

export type FivepostRowDto = {
  id: number;
  batchId: number;
  lineNo: number;
  clientOrderNo: string;
  partnerOrderNo: string;
  teBarcode: string;
  placesCount: number;
  omniBarcode: string;
  itemName: string;
  itemNameRu: string;
  unitCost: number | null;
  totalCost: number | null;
  weightG: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
};

export type FivepostImportResult = {
  batchId: number;
  rowCount: number;
  translatedCount: number;
  rows: FivepostRowDto[];
};

export async function fetchAdminFivepostBatches(adminToken: string): Promise<FivepostBatchSummary[]> {
  const res = await fetch("/api/admin-fivepost-shipments", {
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as { batches?: FivepostBatchSummary[]; error?: string };
  if (!res.ok) throw new Error(data?.error || `Ошибка загрузки (${res.status})`);
  return data.batches || [];
}

export async function fetchAdminFivepostRows(adminToken: string, batchId: number): Promise<FivepostRowDto[]> {
  const res = await fetch(`/api/admin-fivepost-shipments?batchId=${batchId}`, {
    headers: adminAuthHeaders(adminToken),
  });
  const data = (await res.json().catch(() => ({}))) as { rows?: FivepostRowDto[]; error?: string };
  if (!res.ok) throw new Error(data?.error || `Ошибка загрузки (${res.status})`);
  return data.rows || [];
}

export async function importAdminFivepostFile(
  adminToken: string,
  file: File,
  opts?: { route?: FivepostRoute; translate?: boolean },
): Promise<FivepostImportResult> {
  const form = new FormData();
  form.append("file", file);
  if (opts?.route) form.append("route", opts.route);
  if (opts?.translate === false) form.append("translate", "0");

  const res = await fetch("/api/admin-fivepost-import", {
    method: "POST",
    headers: adminAuthHeaders(adminToken),
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as FivepostImportResult & { error?: string };
  if (!res.ok) throw new Error(data?.error || `Ошибка импорта (${res.status})`);
  return data;
}

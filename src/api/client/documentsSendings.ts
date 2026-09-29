import { documentsAuthHeaders, documentsFetchJson, type DocumentsAuth } from "./documentsAuth";
import { apiFetchJson } from "../../utils";

export type EorStatus = string;

export async function fetchSendingsEorMap(
  auth: DocumentsAuth
): Promise<Record<string, EorStatus[]> | null> {
  try {
    const res = await fetch("/api/sendings-eor", {
      method: "GET",
      headers: documentsAuthHeaders(auth),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    if (data && typeof data.map === "object" && data.map !== null) {
      return data.map as Record<string, EorStatus[]>;
    }
    return null;
  } catch {
    return null;
  }
}

export async function postSendingsEorStatus(body: {
  login?: string;
  password?: string;
  inn?: string | null;
  rowKey: string;
  statuses: string[];
  sendingNumber?: string | null;
  sendingDate?: string | null;
}): Promise<void> {
  const { ok, data } = await documentsFetchJson<{ error?: string }>("/api/sendings-eor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!ok) throw new Error(String(data?.error || "HTTP error"));
}

export type PlanDateQueueTask = {cargo_number:string;target_date:string;state:string;last_error?:string;updated_at?:string};
export type SendingsPlanDateResult = {queued:number;tasks:PlanDateQueueTask[];error?:string};
export async function postSendingsPlanDate(date:string,cargoNumbers:string[],auth:DocumentsAuth):Promise<SendingsPlanDateResult> {
 const {ok,data}=await documentsFetchJson<SendingsPlanDateResult>("/api/sendings-plan-date",{
   method:'POST',headers:documentsAuthHeaders(auth,{'Content-Type':'application/json'}),body:JSON.stringify({date,cargoNumbers})
 });
 if(!ok)throw new Error(data?.error||'Не удалось поставить дату в очередь');
 return data;
}
export async function fetchPlanDateQueue(auth:DocumentsAuth):Promise<PlanDateQueueTask[]> {
 const {ok,data}=await documentsFetchJson<{tasks:PlanDateQueueTask[];error?:string}>("/api/sendings-plan-date",{
   method:'POST',headers:documentsAuthHeaders(auth,{'Content-Type':'application/json'}),body:JSON.stringify({action:'status'})
 });
 if(!ok)throw new Error(data?.error||'Не удалось прочитать очередь');
 return data.tasks;
}

export async function fetchMarinesiaShipEta(mmsi: string): Promise<string | null> {
  try {
    const data = await apiFetchJson<{ vessel?: { eta?: string } }>(
      `/api/marinesia-ship?mmsi=${encodeURIComponent(mmsi)}`
    );
    return data?.vessel?.eta ? String(data.vessel.eta) : null;
  } catch {
    return null;
  }
}

export async function postSendingsFerryAssignment(body: {
  login?: string;
  password?: string;
  rowKey: string;
  ferryId?: number;
  eta?: string | null;
  inn?: string;
}): Promise<Record<string, unknown>> {
  const { ok, status, data } = await documentsFetchJson("/api/sendings-ferry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!ok) {
    const msg =
      status === 401
        ? "Сохранение парома доступно только зарегистрированным пользователям. Войдите по email."
        : String((data as { error?: string })?.error || `HTTP ${status}`);
    throw new Error(msg);
  }
  return data;
}

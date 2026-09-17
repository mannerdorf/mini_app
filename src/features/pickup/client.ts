import type { Account } from "../../types";
import { resolveApiOrigin } from "../../lib/resolveApiOrigin";
import { storedValue, unpackValue, cacheBelongsTo, cacheHasUnsent } from "./cachePolicy";
export type PickupCall = <T = any>(body: Record<string, unknown>) => Promise<T>;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
const closedOwners = new Set<string>();
const blockedKey = (key: string) => [...closedOwners].some(login => cacheBelongsTo(key, login));
export function pickupClient(account: Account): PickupCall {
  closedOwners.delete(account.login.trim().toLowerCase());
  const attempts = new Map<string, string>();
  return async (body) => {
    // Reuse an id after an uncertain response, including repeated form submissions.
    const { requestId, ...payload } = body;
    const fingerprint = JSON.stringify(payload);
    const effectiveId = requestId
      ? (attempts.get(fingerprint) ?? String(requestId))
      : undefined;
    if (effectiveId) attempts.set(fingerprint, effectiveId);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      ["check_route", "billing_journal"].includes(String(body.action)) ? 100000 : 30000,
    );
    try {
      const response = await fetch(`${resolveApiOrigin()}/api/pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          ...(effectiveId ? { requestId: effectiveId } : {}),
          login: account.login,
          password: account.password,
        }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status < 500) attempts.delete(fingerprint);
        throw new ApiError(
          result.error || `Ошибка запроса (${response.status})`,
          response.status,
        );
      }
      attempts.delete(fingerprint);
      return result;
    } finally {
      clearTimeout(timeout);
    }
  };
}
// IndexedDB holds only this user's driver snapshot/outbox, never credentials.
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("haulz-pickup", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("cache");
    };
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result);
  });
}
export async function cacheRead<T>(key: string): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("cache", "readwrite"),
      r = tx.objectStore("cache").get(key);
    let value: unknown;
    r.onsuccess = () => {
      const result = unpackValue(key,r.result);
      value = result.value;
      if (result.expired) tx.objectStore("cache").delete(key);
    };
    tx.oncomplete = () => {
      db.close();
      resolve(value as T | undefined);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function cacheWrite(key: string, value: unknown): Promise<void> {
  if (blockedKey(key)) throw new Error("Аккаунт выходит из приложения");
  const db = await database();
  if (blockedKey(key)) { db.close(); throw new Error("Аккаунт выходит из приложения"); }
  return new Promise((resolve, reject) => {
    const tx = db.transaction("cache", "readwrite");
    if (value === undefined) tx.objectStore("cache").delete(key);
    else tx.objectStore("cache").put(storedValue(value), key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
/** Logout never silently deletes pending work. Caller can cancel and finish synchronization. */
export async function clearPickupForLogout(logins: string[], confirmDiscard: () => boolean): Promise<boolean> {
  // Stop new writes before opening the database. Existing transactions finish
  // before the cursor transaction, so their pending work participates in confirmation.
  const owners = logins.map(login => login.trim().toLowerCase());
  owners.forEach(login => closedOwners.add(login));
  let completed = false;
  let db: IDBDatabase | undefined;
  try {
    db = await database();
    const opened = db;
    const entries = await new Promise<Array<{key:string;value:unknown}>>((resolve,reject) => {
      const tx=opened.transaction('cache','readonly'), rows:Array<{key:string;value:unknown}>=[];
      const cursor=tx.objectStore('cache').openCursor();
      cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;const key=String(item.key);if(logins.some(login=>cacheBelongsTo(key,login)))rows.push({key,value:unpackValue(key,item.value).value});item.continue();};
      tx.oncomplete=()=>resolve(rows);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    if(entries.some(row=>cacheHasUnsent(row.key,row.value)) && !confirmDiscard())return false;
    await new Promise<void>((resolve,reject)=>{
      const tx=opened.transaction('cache','readwrite');for(const row of entries)tx.objectStore('cache').delete(row.key);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    completed = true;
    return true;
  } finally {
    db?.close();
    if (!completed) owners.forEach(login => closedOwners.delete(login));
  }
}
export async function preparePhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Выберите фотографию");
  if (file.size > 25000000)
    throw new Error("Исходное фото должно быть меньше 25 МБ");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ratio = Math.min(1, 1500 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * ratio);
    canvas.height = Math.round(image.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Не удалось обработать фото");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL("image/jpeg", 0.78);
    if (data.length > 1100000) data = canvas.toDataURL("image/jpeg", 0.5);
    if (data.length > 1100000)
      throw new Error("Фото слишком большое. Выберите другое");
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

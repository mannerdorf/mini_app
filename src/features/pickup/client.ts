import type { Account } from "../../types";
import { resolveApiOrigin } from "../../lib/resolveApiOrigin";
export type PickupCall = <T = any>(body: Record<string, unknown>) => Promise<T>;
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function pickupClient(account: Account): PickupCall {
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
    const timeout = setTimeout(() => controller.abort(), 30000);
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
    const tx = db.transaction("cache", "readonly"),
      r = tx.objectStore("cache").get(key);
    tx.oncomplete = () => {
      db.close();
      resolve(r.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function cacheWrite(key: string, value: unknown): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("cache", "readwrite");
    tx.objectStore("cache").put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
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

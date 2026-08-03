import { formatDisplayDate, formatDisplayDateFromDate } from "../../../lib/dateUtils";

const MS30D = 30 * 24 * 3600 * 1000;

export function formatRelativeLoginTime(lastLoginAt: string | null | undefined, now = Date.now()): string {
  if (!lastLoginAt) return "никогда";
  const d = new Date(lastLoginAt);
  const dMs = now - d.getTime();
  const diffM = Math.floor(dMs / 60000);
  const diffH = Math.floor(dMs / 3600000);
  const diffD = Math.floor(dMs / 86400000);
  if (diffM < 1) return "только что";
  if (diffM < 60) return `${diffM} мин назад`;
  if (diffH < 24) return `${diffH} ч назад`;
  if (diffD < 7) return `${diffD} дн назад`;
  return formatDisplayDateFromDate(d);
}

export function formatRelativeLoginTimeFromMs(lastLoginMs: number, now = Date.now()): string {
  if (!lastLoginMs) return "нет входов";
  const diffM = Math.floor((now - lastLoginMs) / 60000);
  const diffH = Math.floor((now - lastLoginMs) / 3600000);
  const diffD = Math.floor((now - lastLoginMs) / 86400000);
  if (diffM < 1) return "только что";
  if (diffM < 60) return `${diffM} мин назад`;
  if (diffH < 24) return `${diffH} ч назад`;
  if (diffD < 7) return `${diffD} дн назад`;
  return formatDisplayDate(new Date(lastLoginMs).toISOString());
}

export function topActiveAccentOpacity(lastLoginAt: string | null | undefined, now = Date.now()): number {
  const lastMs = lastLoginAt ? new Date(lastLoginAt).getTime() : 0;
  const diffMs = lastMs ? now - lastMs : Infinity;
  const freshness = diffMs >= MS30D ? 0 : Math.max(0, 1 - diffMs / MS30D);
  return Math.min(0.5, 0.12 + freshness * 0.38);
}

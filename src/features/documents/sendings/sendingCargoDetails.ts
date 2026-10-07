import { getRequestParcels } from './sendingsParcelHelpers';
import { normCargoKey } from '../lib/documentsPipeline';

/** Only consolidation IDs; parcel tracking IDs are not cargo numbers. */
export function sendingCargoDetailNumbers(row: unknown): string[] {
  return [...new Set(getRequestParcels(row).map(p => String(p.Перевозка ?? p.CargoNumber ?? p.NumberPerevozki ?? '').trim())
    .filter(n => /^\d{1,20}$/.test(n)).map(normCargoKey))].sort();
}

export function mergeSendingCargoDetails(base: any[], details: any[]): any[] {
  const byNumber = new Map<string, any>();
  for (const item of [...base, ...details]) {
    const key = normCargoKey(String(item?.Number ?? item?.number ?? ''));
    if (key) byNumber.set(key, {...byNumber.get(key), ...item});
  }
  return [...byNumber.values()];
}

import { PACKAGING_EXTRA_LABEL } from "./defaultExtras.js";
import { DEFAULT_RIGID_PACKAGING_MAX_HEIGHT_M } from "./defaultRigidPackaging.js";
import { normalizeParcelPlaces } from "./placeDimensions.js";
import type { ParcelPlace, PalletType, QuoteLine, RigidPackagingPayload } from "./types.js";

type PackItem = { id: number; l: number; w: number; h: number };

type PlacedItem = PackItem & { x: number; y: number; l: number; w: number; h: number };

type PalletPackState = {
  items: PlacedItem[];
  shelves: { y: number; height: number; usedX: number }[];
  maxHeightMm: number;
};

function itemFitsFootprint(itemL: number, itemW: number, palL: number, palW: number): boolean {
  return (itemL <= palL && itemW <= palW) || (itemW <= palL && itemL <= palW);
}

function tryPlaceOnPallet(
  item: PackItem,
  palL: number,
  palW: number,
  maxHeightMm: number,
  state: PalletPackState,
): boolean {
  if (item.h > maxHeightMm) return false;
  const orientations: [number, number][] = [
    [item.l, item.w],
    [item.w, item.l],
  ];
  for (const [il, iw] of orientations) {
    if (!itemFitsFootprint(il, iw, palL, palW)) continue;
    for (const shelf of state.shelves) {
      if (shelf.usedX + il <= palL && iw <= shelf.height) {
        state.items.push({ ...item, x: shelf.usedX, y: shelf.y, l: il, w: iw, h: item.h });
        shelf.usedX += il;
        state.maxHeightMm = Math.max(state.maxHeightMm, item.h);
        return true;
      }
    }
    const nextY = state.shelves.reduce((max, shelf) => Math.max(max, shelf.y + shelf.height), 0);
    if (nextY + iw <= palW) {
      state.shelves.push({ y: nextY, height: iw, usedX: il });
      state.items.push({ ...item, x: 0, y: nextY, l: il, w: iw, h: item.h });
      state.maxHeightMm = Math.max(state.maxHeightMm, item.h);
      return true;
    }
  }
  return false;
}

function packItemsOnPallets(
  items: PackItem[],
  palL: number,
  palW: number,
  maxHeightMm: number,
): PalletPackState[] | null {
  for (const item of items) {
    if (!itemFitsFootprint(item.l, item.w, palL, palW)) return null;
  }
  const sorted = [...items].sort((a, b) => Math.max(b.l, b.w) - Math.max(a.l, a.w));
  const pallets: PalletPackState[] = [];
  for (const item of sorted) {
    let placed = false;
    for (const pallet of pallets) {
      if (tryPlaceOnPallet(item, palL, palW, maxHeightMm, pallet)) {
        placed = true;
        break;
      }
    }
    if (placed) continue;
    const next: PalletPackState = { items: [], shelves: [], maxHeightMm: 0 };
    if (!tryPlaceOnPallet(item, palL, palW, maxHeightMm, next)) return null;
    pallets.push(next);
  }
  return pallets;
}

function palletCostRub(pallet: PalletPackState, palletType: PalletType): number {
  const heightM = pallet.maxHeightMm / 1000;
  const meters = Math.max(1, Math.ceil(heightM));
  return meters * (Number(palletType.price_per_meter_rub) || 0) + (Number(palletType.pallet_price_rub) || 0);
}

function placesToItems(places: ParcelPlace[]): PackItem[] {
  return normalizeParcelPlaces(places).map((p, id) => ({
    id,
    l: Math.max(1, Math.round(Number(p.lengthCm) || 0)) * 10,
    w: Math.max(1, Math.round(Number(p.widthCm) || 0)) * 10,
    h: Math.max(1, Math.round(Number(p.heightCm) || 0)) * 10,
  }));
}

export function calcRigidPackagingQuote(
  places: ParcelPlace[],
  config: RigidPackagingPayload | null | undefined,
): QuoteLine | null {
  const palletTypes = (config?.pallet_types ?? []).filter(
    (p) => (Number(p.length_mm) || 0) > 0 && (Number(p.width_mm) || 0) > 0,
  );
  if (!palletTypes.length || !places.length) return null;

  const items = placesToItems(places);
  if (!items.length) return null;

  const maxHeightMm = Math.max(0.1, Number(config?.max_height_m) || DEFAULT_RIGID_PACKAGING_MAX_HEIGHT_M) * 1000;

  let best: { total: number; palletType: PalletType; pallets: PalletPackState[] } | null = null;

  for (const palletType of palletTypes) {
    const palL = Math.round(Number(palletType.length_mm) || 0);
    const palW = Math.round(Number(palletType.width_mm) || 0);
    if (palL <= 0 || palW <= 0) continue;
    const packed = packItemsOnPallets(items, palL, palW, maxHeightMm);
    if (!packed) continue;
    const total = packed.reduce((sum, pallet) => sum + palletCostRub(pallet, palletType), 0);
    if (!best || total < best.total) {
      best = { total, palletType, pallets: packed };
    }
  }

  if (!best || best.total <= 0) return null;

  return {
    key: "extra:packaging",
    label: PACKAGING_EXTRA_LABEL,
    amountRub: Math.round(best.total * 100) / 100,
    meta: {
      palletType: best.palletType.code,
      palletCount: best.pallets.length,
    },
  };
}

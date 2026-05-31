import type React from "react";

export const MAX_CLAIM_FILE_BYTES = 5 * 1024 * 1024;

export const MANIPULATION_SIGN_OPTIONS = [
  { id: "fragile", label: "Хрупкое" },
  { id: "keep_dry", label: "Беречь от влаги" },
  { id: "this_side_up", label: "Верх / Не кантовать" },
  { id: "do_not_stack", label: "Не штабелировать" },
  { id: "temperature_control", label: "Температурный режим" },
  { id: "handle_with_care", label: "Осторожно, обращаться бережно" },
] as const;

export const PACKAGING_TYPE_OPTIONS = [
  { id: "box", label: "Коробка" },
  { id: "pallet", label: "Паллет" },
  { id: "crate", label: "Ящик" },
  { id: "bag", label: "Мешок" },
  { id: "film", label: "Стретч-пленка" },
  { id: "wooden_frame", label: "Обрешетка" },
  { id: "without_packaging", label: "Без упаковки" },
] as const;

export const MANIPULATION_SIGN_LABELS_RU: Record<string, string> = Object.fromEntries(
  MANIPULATION_SIGN_OPTIONS.map((o) => [o.id, o.label])
);

export const PACKAGING_TYPE_LABELS_RU: Record<string, string> = Object.fromEntries(
  PACKAGING_TYPE_OPTIONS.map((o) => [o.id, o.label])
);

export const FILE_PICKER_BUTTON_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "10rem",
  height: 44,
  boxSizing: "border-box",
  padding: "0.42rem 0.8rem",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-card, #fff)",
  cursor: "pointer",
  fontSize: "0.82rem",
  fontWeight: 500,
};

export const CLAIM_ROW_ACTION_BUTTON_STYLE: React.CSSProperties = {
  width: 110,
  height: 36,
  boxSizing: "border-box",
  marginTop: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 0.7rem",
  whiteSpace: "nowrap",
};

export type ClaimFormType = "cargo_damage" | "quantity_mismatch" | "cargo_loss" | "other";

export type ClaimNomenclatureRow = {
  key: string;
  barcode: string;
  name: string;
  declaredCost: string;
};

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button, Typography } from "@maxhub/max-ui";
import type { AuthData } from "../../types";
import {
  createHaulzCarrier,
  listHaulzCarriers,
  updateHaulzCarrier,
} from "../../api/client/haulzReturnsCarriers";
import type { HaulzCarrier, HaulzCarrierInput } from "../../../lib/haulzReturns/carriers";
import { formatCarrierCard } from "../../../lib/haulzReturns/carriers";
import { carrierToInput, HaulzCarrierFormModal } from "./HaulzCarrierFormModal";

const NEW_CARRIER = "__new__";

type Props = {
  auth: AuthData;
  sheetId: string;
  carrierId: string | null | undefined;
  onCarrierChange: (carrierId: string | null) => void | Promise<void>;
  onError?: (message: string) => void;
};

export function HaulzUlCarrierPanel({ auth, sheetId, carrierId, onCarrierChange, onError }: Props) {
  const [carriers, setCarriers] = useState<HaulzCarrier[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editCarrier, setEditCarrier] = useState<HaulzCarrier | null>(null);

  const refreshCarriers = useCallback(async () => {
    setLoading(true);
    try {
      setCarriers(await listHaulzCarriers(auth));
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    void refreshCarriers().catch((e: unknown) => {
      onError?.((e as Error)?.message || "Не удалось загрузить перевозчиков");
    });
  }, [refreshCarriers, onError]);

  const selected = useMemo(
    () => carriers.find((c) => c.id === carrierId) ?? null,
    [carriers, carrierId],
  );

  const handleSelectChange = (value: string) => {
    if (value === NEW_CARRIER) {
      setEditCarrier(null);
      setModalOpen(true);
      return;
    }
    void onCarrierChange(value || null);
  };

  const handleSaveCarrier = async (input: HaulzCarrierInput) => {
    setSaving(true);
    try {
      const saved = editCarrier
        ? await updateHaulzCarrier(auth, editCarrier.id, input)
        : await createHaulzCarrier(auth, input);
      await refreshCarriers();
      await onCarrierChange(saved.id);
      setModalOpen(false);
      setEditCarrier(null);
    } catch (e: unknown) {
      onError?.((e as Error)?.message || "Ошибка сохранения перевозчика");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="hr-carrier-panel">
      <FlexRow>
        <label className="hr-carrier-panel__select-wrap">
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
            Перевозчик
          </Typography.Body>
          <select
            className="hr-carrier-panel__select"
            value={carrierId ?? ""}
            disabled={loading || saving}
            onChange={(e) => handleSelectChange(e.target.value)}
          >
            <option value="">— выберите перевозчика —</option>
            {carriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.inn ? ` · ИНН ${c.inn}` : ""}
              </option>
            ))}
            <option value={NEW_CARRIER}>+ Создать нового перевозчика…</option>
          </select>
        </label>
        {selected ? (
          <Button
            type="button"
            className="filter-button"
            disabled={saving}
            onClick={() => {
              setEditCarrier(selected);
              setModalOpen(true);
            }}
          >
            <Pencil className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Редактировать
          </Button>
        ) : (
          <Button
            type="button"
            className="filter-button"
            disabled={saving}
            onClick={() => {
              setEditCarrier(null);
              setModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Новый перевозчик
          </Button>
        )}
      </FlexRow>

      {selected ? (
        <pre className="hr-carrier-card">{formatCarrierCard(selected)}</pre>
      ) : (
        <Typography.Body style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
          УЛ {sheetId.startsWith("ul-") ? sheetId.slice(3) : sheetId}: выберите перевозчика из справочника или создайте нового.
        </Typography.Body>
      )}

      <HaulzCarrierFormModal
        open={modalOpen}
        title={editCarrier ? "Карточка перевозчика" : "Новый перевозчик"}
        initial={editCarrier ? carrierToInput(editCarrier) : null}
        saving={saving}
        onClose={() => {
          setModalOpen(false);
          setEditCarrier(null);
        }}
        onSave={handleSaveCarrier}
      />
    </div>
  );
}

function FlexRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "flex-end", marginBottom: "0.75rem" }}>
      {children}
    </div>
  );
}

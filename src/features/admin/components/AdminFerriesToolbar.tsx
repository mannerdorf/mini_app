import React from "react";
import { Button, Flex, Input, Typography } from "@maxhub/max-ui";
import { Loader2, Plus } from "lucide-react";
import type { AdminFerriesState } from "../hooks/useAdminFerries";

export function AdminFerriesToolbar({ f }: { f: AdminFerriesState }) {
  return (
    <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
      <Button type="button" className="filter-button" disabled={f.ferriesLoading} onClick={f.refreshList}>
        {f.ferriesLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
        Обновить
      </Button>
      <Button
        type="button"
        className="button-primary"
        disabled={f.ferriesEnrichLoading || f.ferriesList.length === 0}
        onClick={() => void f.enrichFromMarinesia()}
      >
        {f.ferriesEnrichLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
        Запросить у Marinesia
      </Button>
      <Button type="button" className="button-primary" disabled={f.ferriesLoading} onClick={f.openAddModal}>
        <Plus className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
        Добавить паром
      </Button>
    </Flex>
  );
}

export function AdminFerryAddModal({ f }: { f: AdminFerriesState }) {
  if (!f.ferryAddModalOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={f.closeAddModal} role="dialog" aria-modal="true" aria-labelledby="ferry-add-title">
      <div className="modal-content" style={{ maxWidth: "22rem", padding: "1.25rem" }} onClick={(e) => e.stopPropagation()}>
        <Typography.Headline id="ferry-add-title" style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>Добавить паром</Typography.Headline>
        <div style={{ marginBottom: "0.75rem" }}>
          <label htmlFor="ferry-add-name" style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", color: "var(--color-text-secondary)" }}>Наименование</label>
          <Input
            id="ferry-add-name"
            className="admin-form-input"
            value={f.ferryAddName}
            onChange={(e) => f.setFerryAddName(e.target.value)}
            placeholder="Например: Marshal Rokossovsky"
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label htmlFor="ferry-add-mmsi" style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", color: "var(--color-text-secondary)" }}>MMSI (9 цифр)</label>
          <Input
            id="ferry-add-mmsi"
            className="admin-form-input"
            value={f.ferryAddMmsi}
            onChange={(e) => f.setFerryAddMmsi(e.target.value.replace(/\D/g, "").slice(0, 9))}
            placeholder="273214860"
            inputMode="numeric"
            style={{ width: "100%", padding: "0.5rem" }}
          />
        </div>
        {f.ferryAddError && (
          <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>{f.ferryAddError}</Typography.Body>
        )}
        <Flex gap="0.5rem" justify="flex-end">
          <Button type="button" className="filter-button" disabled={f.ferryAddLoading} onClick={f.closeAddModal}>Отмена</Button>
          <Button
            type="button"
            className="button-primary"
            disabled={f.ferryAddLoading || !f.ferryAddName.trim() || f.ferryAddMmsi.replace(/\D/g, "").length !== 9}
            onClick={() => void f.submitAddFerry()}
          >
            {f.ferryAddLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Добавить
          </Button>
        </Flex>
      </div>
    </div>
  );
}

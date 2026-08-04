import React from "react";
import { Panel, Typography } from "@maxhub/max-ui";
import { useAdminFerries } from "../hooks/useAdminFerries";
import { AdminFerriesToolbar, AdminFerryAddModal } from "../components/AdminFerriesToolbar";
import { AdminFerriesTable } from "../components/AdminFerriesTable";

export function AdminFerriesTab({ adminToken }: { adminToken: string }) {
  const f = useAdminFerries({ adminToken });

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник паромов</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Наименование, MMSI. Кнопка «Запросить у Marinesia» обновит IMO и тип судна для паромов в зоне Балтики.
      </Typography.Body>
      <AdminFerriesToolbar f={f} />
      <AdminFerryAddModal f={f} />
      {f.ferriesEnrichMessage ? (
        <Typography.Body style={{ marginBottom: "0.5rem", fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
          {f.ferriesEnrichMessage}
        </Typography.Body>
      ) : null}
      <AdminFerriesTable f={f} />
    </Panel>
  );
}

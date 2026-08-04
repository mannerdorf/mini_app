import React from "react";
import { Button, Flex, Input, Typography } from "@maxhub/max-ui";
import { Loader2, Trash2 } from "lucide-react";
import type { AdminFerriesState } from "../hooks/useAdminFerries";

export function AdminFerriesTable({ f }: { f: AdminFerriesState }) {
  if (f.ferriesLoading) {
    return (
      <Flex align="center" gap="0.5rem">
        <Loader2 className="w-4 h-4 animate-spin" />
        <Typography.Body>Загрузка...</Typography.Body>
      </Flex>
    );
  }

  if (f.ferriesList.length === 0) {
    return <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Справочник пуст</Typography.Body>;
  }

  return (
    <>
      <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Наименование</th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>MMSI</th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>IMO</th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Тип судна</th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600 }}>TEU</th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600 }}>Трейлеров</th>
              <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Оператор</th>
              <th style={{ padding: "0.5rem 0.75rem", width: 44, textAlign: "center", fontWeight: 600 }}></th>
            </tr>
          </thead>
          <tbody>
            {f.ferriesList.map((row) => {
              const mmsiVal = f.ferryEditMmsi[row.id] ?? row.mmsi;
              const mmsiChanged = mmsiVal !== row.mmsi;
              const mmsiValid = mmsiVal.replace(/\D/g, "").length === 9;
              return (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{row.name}</td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    <Flex align="center" gap="0.35rem">
                      <Input
                        className="admin-form-input"
                        value={mmsiVal}
                        onChange={(e) => f.setFerryEditMmsi((prev) => ({ ...prev, [row.id]: e.target.value.replace(/\D/g, "").slice(0, 9) }))}
                        placeholder="9 цифр"
                        inputMode="numeric"
                        style={{ width: "7rem", padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                      />
                      {mmsiChanged && mmsiValid ? (
                        <Button
                          type="button"
                          className="button-primary"
                          disabled={f.ferrySaveLoading === row.id}
                          style={{ padding: "0.2rem 0.5rem", minWidth: "auto", fontSize: "0.75rem" }}
                          onClick={() => void f.saveMmsi(row, mmsiVal.replace(/\D/g, ""))}
                        >
                          {f.ferrySaveLoading === row.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Сохранить"}
                        </Button>
                      ) : null}
                    </Flex>
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>{row.imo || "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>{row.vessel_type || "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>{row.teu_capacity ?? "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>{row.trailer_capacity ?? "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>{row.operator || "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                    <Button
                      type="button"
                      className="filter-button"
                      disabled={f.ferryDeleteLoading === row.id}
                      style={{ padding: "0.25rem", minWidth: "auto", color: "var(--color-error)" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        void f.deleteFerry(row);
                      }}
                      title="Удалить"
                      aria-label={`Удалить паром ${row.name}`}
                    >
                      {f.ferryDeleteLoading === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
        Записей: {f.ferriesList.length}
      </Typography.Body>
    </>
  );
}

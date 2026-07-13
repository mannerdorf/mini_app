import React, { useEffect, useState } from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  deleteAdminFerry,
  enrichAdminFerriesMarinesia,
  fetchAdminFerries,
  saveAdminFerry,
  type AdminFerryRow,
} from "../../../api/client/admin/directories";

export function AdminFerriesTab({ adminToken }: { adminToken: string }) {
  const [ferriesList, setFerriesList] = useState<AdminFerryRow[]>([]);
  const [ferriesLoading, setFerriesLoading] = useState(false);
  const [ferriesFetchTrigger, setFerriesFetchTrigger] = useState(0);
  const [ferriesEnrichLoading, setFerriesEnrichLoading] = useState(false);
  const [ferriesEnrichMessage, setFerriesEnrichMessage] = useState<string | null>(null);
  const [ferryEditMmsi, setFerryEditMmsi] = useState<Record<number, string>>({});
  const [ferrySaveLoading, setFerrySaveLoading] = useState<number | null>(null);
  const [ferryDeleteLoading, setFerryDeleteLoading] = useState<number | null>(null);
  const [ferryAddModalOpen, setFerryAddModalOpen] = useState(false);
  const [ferryAddName, setFerryAddName] = useState("");
  const [ferryAddMmsi, setFerryAddMmsi] = useState("");
  const [ferryAddLoading, setFerryAddLoading] = useState(false);
  const [ferryAddError, setFerryAddError] = useState<string | null>(null);

  useEffect(() => {
    setFerriesLoading(true);
    fetchAdminFerries(adminToken)
      .then(setFerriesList)
      .catch(() => setFerriesList([]))
      .finally(() => setFerriesLoading(false));
  }, [adminToken, ferriesFetchTrigger]);

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник паромов</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Наименование, MMSI. Кнопка «Запросить у Marinesia» обновит IMO и тип судна для паромов в зоне Балтики.
      </Typography.Body>
      <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
        <Button type="button" className="filter-button" disabled={ferriesLoading} onClick={() => setFerriesFetchTrigger((n) => n + 1)}>
          {ferriesLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
          Обновить
        </Button>
        <Button
          type="button"
          className="button-primary"
          disabled={ferriesEnrichLoading || ferriesList.length === 0}
          onClick={async () => {
            setFerriesEnrichLoading(true);
            setFerriesEnrichMessage(null);
            try {
              const data = await enrichAdminFerriesMarinesia(adminToken);
              setFerriesEnrichMessage(`Обновлено: ${data.updated} из ${data.total} паромов`);
              setFerriesFetchTrigger((n) => n + 1);
            } catch (e) {
              setFerriesEnrichMessage((e as Error)?.message || "Ошибка обогащения");
            } finally {
              setFerriesEnrichLoading(false);
            }
          }}
        >
          {ferriesEnrichLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
          Запросить у Marinesia
        </Button>
        <Button
          type="button"
          className="button-primary"
          disabled={ferriesLoading}
          onClick={() => {
            setFerryAddModalOpen(true);
            setFerryAddName("");
            setFerryAddMmsi("");
            setFerryAddError(null);
          }}
        >
          <Plus className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          Добавить паром
        </Button>
      </Flex>
      {ferryAddModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => !ferryAddLoading && setFerryAddModalOpen(false)} role="dialog" aria-modal="true" aria-labelledby="ferry-add-title">
          <div className="modal-content" style={{ maxWidth: "22rem", padding: "1.25rem" }} onClick={(e) => e.stopPropagation()}>
            <Typography.Headline id="ferry-add-title" style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>Добавить паром</Typography.Headline>
            <div style={{ marginBottom: "0.75rem" }}>
              <label htmlFor="ferry-add-name" style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", color: "var(--color-text-secondary)" }}>Наименование</label>
              <Input
                id="ferry-add-name"
                className="admin-form-input"
                value={ferryAddName}
                onChange={(e) => setFerryAddName(e.target.value)}
                placeholder="Например: Marshal Rokossovsky"
                style={{ width: "100%", padding: "0.5rem" }}
              />
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="ferry-add-mmsi" style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", color: "var(--color-text-secondary)" }}>MMSI (9 цифр)</label>
              <Input
                id="ferry-add-mmsi"
                className="admin-form-input"
                value={ferryAddMmsi}
                onChange={(e) => setFerryAddMmsi(e.target.value.replace(/\D/g, "").slice(0, 9))}
                placeholder="273214860"
                inputMode="numeric"
                style={{ width: "100%", padding: "0.5rem" }}
              />
            </div>
            {ferryAddError && (
              <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>{ferryAddError}</Typography.Body>
            )}
            <Flex gap="0.5rem" justify="flex-end">
              <Button type="button" className="filter-button" disabled={ferryAddLoading} onClick={() => setFerryAddModalOpen(false)}>Отмена</Button>
              <Button
                type="button"
                className="button-primary"
                disabled={ferryAddLoading || !ferryAddName.trim() || ferryAddMmsi.replace(/\D/g, "").length !== 9}
                onClick={async () => {
                  const name = ferryAddName.trim();
                  const mmsi = ferryAddMmsi.replace(/\D/g, "");
                  if (!name || mmsi.length !== 9) return;
                  setFerryAddLoading(true);
                  setFerryAddError(null);
                  try {
                    await saveAdminFerry(adminToken, { name, mmsi });
                    setFerryAddModalOpen(false);
                    setFerriesFetchTrigger((n) => n + 1);
                  } catch (e) {
                    setFerryAddError((e as Error)?.message || "Ошибка");
                  } finally {
                    setFerryAddLoading(false);
                  }
                }}
              >
                {ferryAddLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Добавить
              </Button>
            </Flex>
          </div>
        </div>
      )}
      {ferriesEnrichMessage && (
        <Typography.Body style={{ marginBottom: "0.5rem", fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
          {ferriesEnrichMessage}
        </Typography.Body>
      )}
      {ferriesLoading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка...</Typography.Body>
        </Flex>
      ) : ferriesList.length === 0 ? (
        <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Справочник пуст</Typography.Body>
      ) : (
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
              {ferriesList.map((f) => {
                const mmsiVal = ferryEditMmsi[f.id] ?? f.mmsi;
                const mmsiChanged = mmsiVal !== f.mmsi;
                const mmsiValid = mmsiVal.replace(/\D/g, "").length === 9;
                return (
                  <tr key={f.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{f.name}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>
                      <Flex align="center" gap="0.35rem">
                        <Input
                          className="admin-form-input"
                          value={mmsiVal}
                          onChange={(e) => setFerryEditMmsi((prev) => ({ ...prev, [f.id]: e.target.value.replace(/\D/g, "").slice(0, 9) }))}
                          placeholder="9 цифр"
                          inputMode="numeric"
                          style={{ width: "7rem", padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                        />
                        {mmsiChanged && mmsiValid && (
                          <Button
                            type="button"
                            className="button-primary"
                            disabled={ferrySaveLoading === f.id}
                            style={{ padding: "0.2rem 0.5rem", minWidth: "auto", fontSize: "0.75rem" }}
                            onClick={async () => {
                              setFerrySaveLoading(f.id);
                              try {
                                await saveAdminFerry(adminToken, { id: f.id, name: f.name, mmsi: mmsiVal.replace(/\D/g, "") });
                                setFerryEditMmsi((prev) => { const next = { ...prev }; delete next[f.id]; return next; });
                                setFerriesFetchTrigger((n) => n + 1);
                              } catch (e) {
                                setFerriesEnrichMessage((e as Error)?.message || "Ошибка сохранения");
                              } finally {
                                setFerrySaveLoading(null);
                              }
                            }}
                          >
                            {ferrySaveLoading === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Сохранить"}
                          </Button>
                        )}
                      </Flex>
                    </td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>{f.imo || "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>{f.vessel_type || "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>{f.teu_capacity ?? "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>{f.trailer_capacity ?? "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>{f.operator || "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem", textAlign: "center" }}>
                      <Button
                        type="button"
                        className="filter-button"
                        disabled={ferryDeleteLoading === f.id}
                        style={{ padding: "0.25rem", minWidth: "auto", color: "var(--color-error)" }}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm(`Удалить паром «${f.name}» (${f.mmsi})?`)) return;
                          setFerryDeleteLoading(f.id);
                          try {
                            await deleteAdminFerry(adminToken, f.id);
                            setFerryEditMmsi((prev) => { const next = { ...prev }; delete next[f.id]; return next; });
                            setFerriesFetchTrigger((n) => n + 1);
                          } catch (err) {
                            setFerriesEnrichMessage((err as Error)?.message || "Ошибка удаления");
                          } finally {
                            setFerryDeleteLoading(null);
                          }
                        }}
                        title="Удалить"
                        aria-label={`Удалить паром ${f.name}`}
                      >
                        {ferryDeleteLoading === f.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!ferriesLoading && ferriesList.length > 0 && (
        <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
          Записей: {ferriesList.length}
        </Typography.Body>
      )}
    </Panel>
  );
}

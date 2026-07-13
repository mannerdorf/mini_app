import React, { useEffect, useState } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { fetchAdminPvzList, refreshAdminPvzCache, type AdminPvzRow } from "../../../api/client/admin/directories";

export function AdminPvzTab({ adminToken }: { adminToken: string }) {
  const [pvzList, setPvzList] = useState<AdminPvzRow[]>([]);
  const [pvzLoading, setPvzLoading] = useState(false);
  const [pvzFetchTrigger, setPvzFetchTrigger] = useState(0);
  const [pvzSyncLoading, setPvzSyncLoading] = useState(false);
  const [pvzSyncMessage, setPvzSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    setPvzLoading(true);
    fetchAdminPvzList(adminToken)
      .then(setPvzList)
      .catch(() => setPvzList([]))
      .finally(() => setPvzLoading(false));
  }, [adminToken, pvzFetchTrigger]);

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник ПВЗ</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Данные загружаются из GETAPI?metod=GETPVZ и обновляются кроном раз в 24 часа.
      </Typography.Body>
      <Flex gap="0.5rem" align="center" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
        <Button
          type="button"
          className="filter-button"
          disabled={pvzLoading}
          onClick={() => setPvzFetchTrigger((n) => n + 1)}
        >
          {pvzLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
          Обновить
        </Button>
        <Button
          type="button"
          className="button-primary"
          disabled={pvzSyncLoading}
          onClick={async () => {
            setPvzSyncLoading(true);
            setPvzSyncMessage(null);
            try {
              const data = await refreshAdminPvzCache(adminToken);
              setPvzSyncMessage(`Обновлено: ${data.pvz_count} записей`);
              setPvzFetchTrigger((n) => n + 1);
            } catch (e: unknown) {
              setPvzSyncMessage((e as Error)?.message || "Не удалось обновить справочник ПВЗ");
            } finally {
              setPvzSyncLoading(false);
            }
          }}
        >
          {pvzSyncLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
          Обновить из 1С
        </Button>
      </Flex>
      {pvzSyncMessage && (
        <Typography.Body style={{ marginBottom: "0.5rem", fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
          {pvzSyncMessage}
        </Typography.Body>
      )}
      {pvzLoading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body>Загрузка...</Typography.Body>
        </Flex>
      ) : pvzList.length === 0 ? (
        <Typography.Body style={{ color: "var(--color-text-secondary)" }}>Справочник пуст</Typography.Body>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: "60vh", overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Наименование</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Код</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Город</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Регион</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Владелец (ИНН)</th>
                <th style={{ padding: "0.5rem 0.75rem", textAlign: "left", fontWeight: 600 }}>Отправитель/Получатель</th>
              </tr>
            </thead>
            <tbody>
              {pvzList.map((p, idx) => (
                <tr key={p.Ссылка || idx} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{p.Наименование || "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>{p.КодДляПечати || "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>{p.ГородНаименование || "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>{p.РегионНаименование || "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
                    {p.ВладелецНаименование ? `${p.ВладелецНаименование}${p.ВладелецИНН ? ` (${p.ВладелецИНН})` : ""}` : p.ВладелецИНН || "—"}
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>{p.ОтправительПолучательНаименование || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!pvzLoading && pvzList.length > 0 && (
        <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.5rem" }}>
          Записей: {pvzList.length}
        </Typography.Body>
      )}
    </Panel>
  );
}

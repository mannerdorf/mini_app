import React from "react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import type { AdminIntegrationsState } from "../hooks/useAdminIntegrations";

type Props = Pick<AdminIntegrationsState, 'zvonobotConfigured' | 'zvonobotKeyHint' | 'zvonobotLoading' | 'zvonobotError' | 'zvonobotResult' | 'zvonobotPhone' | 'setZvonobotPhone' | 'zvonobotOutgoingPhone' | 'setZvonobotOutgoingPhone' | 'zvonobotRecordId' | 'setZvonobotRecordId' | 'zvonobotRecordText' | 'setZvonobotRecordText' | 'zvonobotRecordGender' | 'setZvonobotRecordGender' | 'zvonobotPlannedAt' | 'setZvonobotPlannedAt' | 'zvonobotApiCallIds' | 'setZvonobotApiCallIds' | 'runZvonobotAction'>;

export function AdminZvonobotSandboxPanel({
  zvonobotConfigured,
  zvonobotKeyHint,
  zvonobotLoading,
  zvonobotError,
  zvonobotResult,
  zvonobotPhone,
  setZvonobotPhone,
  zvonobotOutgoingPhone,
  setZvonobotOutgoingPhone,
  zvonobotRecordId,
  setZvonobotRecordId,
  zvonobotRecordText,
  setZvonobotRecordText,
  zvonobotRecordGender,
  setZvonobotRecordGender,
  zvonobotPlannedAt,
  setZvonobotPlannedAt,
  zvonobotApiCallIds,
  setZvonobotApiCallIds,
  runZvonobotAction,
}: Props) {
  return (
<Panel className="cargo-card" style={{ padding: "0.85rem", border: "1px solid var(--color-border)", marginTop: "0.9rem" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Zvonobot API песочница</Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
            Тестовые вызовы через серверный прокси: create/get/userInfo/getPhones/getAvailableLanguages.
          </Typography.Body>
          <Typography.Body style={{ fontSize: "0.8rem", marginBottom: "0.55rem", color: zvonobotConfigured ? "var(--color-text-secondary)" : "var(--color-error, #dc2626)" }}>
            ZVONOBOT_API_KEY: {zvonobotConfigured ? `настроен (${zvonobotKeyHint || "скрыт"})` : "не задан"}
          </Typography.Body>
      
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))", gap: "0.55rem", marginBottom: "0.6rem" }}>
            <Input className="admin-form-input" placeholder="Телефон (11 цифр)" value={zvonobotPhone} onChange={(e) => setZvonobotPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} />
            <Input className="admin-form-input" placeholder="Исходящий номер (11 цифр)" value={zvonobotOutgoingPhone} onChange={(e) => setZvonobotOutgoingPhone(e.target.value.replace(/\D/g, "").slice(0, 11))} />
            <Input className="admin-form-input" placeholder="record.id (опционально)" value={zvonobotRecordId} onChange={(e) => setZvonobotRecordId(e.target.value.replace(/[^\d]/g, ""))} />
            <Input className="admin-form-input" placeholder="plannedAt (unix, опционально)" value={zvonobotPlannedAt} onChange={(e) => setZvonobotPlannedAt(e.target.value.replace(/[^\d]/g, ""))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.55rem", marginBottom: "0.6rem" }}>
            <Input className="admin-form-input" placeholder="Текст для генерации (если нет record.id)" value={zvonobotRecordText} onChange={(e) => setZvonobotRecordText(e.target.value)} />
            <select className="admin-form-input" value={zvonobotRecordGender} onChange={(e) => setZvonobotRecordGender(e.target.value === "1" ? "1" : "0")} style={{ minWidth: "8rem" }}>
              <option value="0">Голос: жен.</option>
              <option value="1">Голос: муж.</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: "0.45rem", alignItems: "center", marginBottom: "0.6rem" }}>
            <Input className="admin-form-input" placeholder="apiCallIdList (через запятую): 123,456" value={zvonobotApiCallIds} onChange={(e) => setZvonobotApiCallIds(e.target.value)} />
            <Button
              type="button"
              className="filter-button"
              disabled={zvonobotLoading}
              onClick={() => {
                const payload: Record<string, unknown> = {};
                if (zvonobotPhone) payload.phone = zvonobotPhone;
                if (zvonobotOutgoingPhone) payload.outgoingPhone = zvonobotOutgoingPhone;
                if (zvonobotPlannedAt) payload.plannedAt = Number(zvonobotPlannedAt);
                if (zvonobotRecordId) payload.record = { id: Number(zvonobotRecordId) };
                else if (zvonobotRecordText.trim()) payload.record = { text: zvonobotRecordText.trim(), gender: Number(zvonobotRecordGender) };
                void runZvonobotAction("create", payload);
              }}
            >
              Создать звонок
            </Button>
            <Button
              type="button"
              className="filter-button"
              disabled={zvonobotLoading}
              onClick={() => {
                const ids = zvonobotApiCallIds
                  .split(",")
                  .map((v) => Number(v.trim()))
                  .filter((v) => Number.isFinite(v) && v > 0);
                void runZvonobotAction("get", { apiCallIdList: ids });
              }}
            >
              Получить звонки
            </Button>
            <Button type="button" className="filter-button" disabled={zvonobotLoading} onClick={() => void runZvonobotAction("userInfo")}>Баланс</Button>
            <Button type="button" className="filter-button" disabled={zvonobotLoading} onClick={() => void runZvonobotAction("getPhones", { all: true })}>Номера</Button>
          </div>
          <Flex align="center" gap="0.45rem" wrap="wrap" style={{ marginBottom: "0.6rem" }}>
            <Button type="button" className="filter-button" disabled={zvonobotLoading} onClick={() => void runZvonobotAction("getAvailableLanguages")}>Языки</Button>
            {zvonobotLoading ? <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>Запрос...</Typography.Body> : null}
          </Flex>
          {zvonobotError ? (
            <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-error, #dc2626)", marginBottom: "0.45rem" }}>
              {zvonobotError}
            </Typography.Body>
          ) : null}
          <textarea
            value={zvonobotResult}
            onChange={() => {}}
            readOnly
            placeholder="Ответ API появится здесь..."
            style={{
              width: "100%",
              minHeight: "11rem",
              resize: "vertical",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.75rem",
              lineHeight: 1.35,
              padding: "0.6rem",
            }}
          />
        </Panel>
  );
}

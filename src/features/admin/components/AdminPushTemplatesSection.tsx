import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2, Save } from "lucide-react";
import {
  fetchAdminPushTemplates,
  saveAdminPushTemplates,
  type AdminPushTemplateRow,
} from "../../../api/client/admin/pushNotifications";
import {
  PUSH_TEMPLATE_SAMPLE_ITEM,
  PUSH_TEMPLATE_VARIABLES,
  buildPushTemplateContext,
  formatPushNotificationMessage,
  renderPushTemplateString,
} from "../../../../lib/pushNotificationTemplates";

type Props = {
  adminToken: string;
  onError?: (message: string | null) => void;
};

type EditableRow = AdminPushTemplateRow;

function previewRow(row: EditableRow): { title: string; body: string } {
  const eventId = row.eventId as Parameters<typeof formatPushNotificationMessage>[0];
  const templates = new Map([
    [
      row.eventId,
      {
        titleTemplate: row.titleTemplate,
        bodyTemplate: row.bodyTemplate,
        enabled: row.enabled,
        updatedAt: null,
        updatedBy: null,
      },
    ],
  ] as const);

  if (row.enabled && row.bodyTemplate.trim()) {
    return formatPushNotificationMessage(
      eventId,
      String(PUSH_TEMPLATE_SAMPLE_ITEM.Number),
      PUSH_TEMPLATE_SAMPLE_ITEM,
      templates as never,
    );
  }

  const ctx = buildPushTemplateContext(eventId, String(PUSH_TEMPLATE_SAMPLE_ITEM.Number), PUSH_TEMPLATE_SAMPLE_ITEM);
  return {
    title: renderPushTemplateString(row.titleTemplate || "HAULZ", ctx).trim() || "HAULZ",
    body: formatPushNotificationMessage(
      eventId,
      String(PUSH_TEMPLATE_SAMPLE_ITEM.Number),
      PUSH_TEMPLATE_SAMPLE_ITEM,
    ).body,
  };
}

export function AdminPushTemplatesSection({ adminToken, onError }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [variables, setVariables] = useState<Array<{ key: string; hint: string }>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setNotice(null);
    onError?.(null);
    try {
      const data = await fetchAdminPushTemplates(adminToken);
      setRows(data.templates);
      setVariables(data.variables);
      setNotice(data.notice ?? null);
      if (!data.templates.length) {
        setLoadError("API вернул пустой список шаблонов");
      }
    } catch (e: unknown) {
      setRows([]);
      setVariables([]);
      const message = (e as Error)?.message || "Не удалось загрузить шаблоны push";
      setLoadError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  }, [adminToken, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => rows.length > 0, [rows]);

  const updateRow = (eventId: string, patch: Partial<EditableRow>) => {
    setRows((prev) => prev.map((row) => (row.eventId === eventId ? { ...row, ...patch } : row)));
  };

  const save = async () => {
    setSaving(true);
    onError?.(null);
    try {
      const result = await saveAdminPushTemplates(
        adminToken,
        rows.map((row) => ({
          eventId: row.eventId,
          titleTemplate: row.titleTemplate,
          bodyTemplate: row.bodyTemplate,
          enabled: row.enabled,
        })),
      );
      setRows(result.templates);
    } catch (e: unknown) {
      onError?.((e as Error)?.message || "Не удалось сохранить шаблоны");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginBottom: "1rem" }}>
      <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem" style={{ marginBottom: "0.35rem" }}>
        <Typography.Body style={{ fontWeight: 600 }}>Шаблоны push по статусам</Typography.Body>
        <Button type="button" className="filter-button" disabled={loading || saving || !dirty} onClick={() => void save()}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : <Save className="w-4 h-4" style={{ marginRight: "0.35rem" }} />}
          Сохранить
        </Button>
      </Flex>
      <Typography.Body
        style={{
          fontSize: "0.8rem",
          color: "var(--color-text-secondary)",
          marginBottom: "0.75rem",
          lineHeight: 1.45,
        }}
      >
        Тексты автоматических push и Telegram по каждому событию. Переменные в фигурных скобках подставляются при
        отправке.
      </Typography.Body>

      {(variables.length > 0 ? variables : PUSH_TEMPLATE_VARIABLES).length > 0 ? (
        <Panel
          style={{
            padding: "0.65rem 0.75rem",
            marginBottom: "0.75rem",
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-secondary, #f8fafc)",
          }}
        >
          <Typography.Body style={{ fontWeight: 600, fontSize: "0.8rem", marginBottom: "0.45rem" }}>
            Переменные шаблона
          </Typography.Body>
          <Typography.Body
            style={{
              fontSize: "0.72rem",
              color: "var(--color-text-secondary)",
              marginBottom: "0.55rem",
              lineHeight: 1.45,
            }}
          >
            Вставляйте в текст в фигурных скобках — при отправке подставятся данные перевозки из 1С.
          </Typography.Body>
          <div style={{ display: "grid", gap: "0.35rem" }}>
            {(variables.length > 0 ? variables : PUSH_TEMPLATE_VARIABLES).map((v) => (
              <div
                key={v.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(7rem, auto) 1fr",
                  gap: "0.5rem",
                  alignItems: "start",
                  fontSize: "0.75rem",
                }}
              >
                <code style={{ whiteSpace: "nowrap" }}>{`{${v.key}}`}</code>
                <span style={{ color: "var(--color-text-secondary)", lineHeight: 1.4 }}>{v.hint}</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {notice ? (
        <Typography.Body style={{ fontSize: "0.78rem", color: "#b45309", marginBottom: "0.75rem" }}>
          {notice}
        </Typography.Body>
      ) : null}

      {loading ? (
        <Flex align="center" gap="0.5rem">
          <Loader2 className="w-4 h-4 animate-spin" />
          <Typography.Body style={{ fontSize: "0.85rem" }}>Загрузка шаблонов…</Typography.Body>
        </Flex>
      ) : loadError || rows.length === 0 ? (
        <div>
          <Typography.Body
            style={{
              display: "block",
              fontSize: "0.85rem",
              color: "var(--color-error, #dc2626)",
              marginBottom: "0.75rem",
            }}
          >
            {loadError || "Шаблоны не загружены"}
          </Typography.Body>
          {loadError &&
          (loadError.includes("Internal server error") ||
            loadError.toLowerCase().includes("relation") ||
            loadError.toLowerCase().includes("бд")) ? (
            <Typography.Body
              style={{
                display: "block",
                fontSize: "0.78rem",
                color: "var(--color-text-secondary)",
                marginBottom: "0.75rem",
              }}
            >
              Если после обновления API ошибка сохраняется, на haulzbackend выполните:{" "}
              <code style={{ display: "block", fontSize: "0.75rem", marginTop: "0.35rem" }}>
                source /opt/haulz/.env && psql &quot;$DATABASE_URL&quot; -f
                /opt/haulz/app/migrations/095_push_notification_templates.sql
              </code>
            </Typography.Body>
          ) : null}
          <Button type="button" className="filter-button" onClick={() => void load()}>
            Повторить
          </Button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {rows.map((row) => {
            const expanded = expandedEventId === row.eventId;
            const preview = previewRow(row);
            return (
              <div
                key={row.eventId}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  padding: "0.75rem",
                  background: "var(--color-bg-secondary, #f8fafc)",
                }}
              >
                <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem" style={{ marginBottom: expanded ? "0.65rem" : 0 }}>
                  <div>
                    <Typography.Body style={{ fontWeight: 600, fontSize: "0.88rem" }}>{row.label}</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>
                      {row.eventId}
                      {row.updatedAt ? ` · изменён ${new Date(row.updatedAt).toLocaleString("ru-RU")}` : ""}
                    </Typography.Body>
                  </div>
                  <Flex align="center" gap="0.65rem">
                    <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8rem" }}>
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) => updateRow(row.eventId, { enabled: e.target.checked })}
                      />
                      Активен
                    </label>
                    <Button
                      type="button"
                      className="filter-button"
                      onClick={() => setExpandedEventId(expanded ? null : row.eventId)}
                    >
                      {expanded ? "Свернуть" : "Редактировать"}
                    </Button>
                  </Flex>
                </Flex>

                {expanded ? (
                  <div style={{ display: "grid", gap: "0.55rem" }}>
                    <input
                      className="admin-form-input"
                      placeholder="Заголовок push"
                      value={row.titleTemplate}
                      onChange={(e) => updateRow(row.eventId, { titleTemplate: e.target.value })}
                    />
                    <textarea
                      className="admin-form-input"
                      placeholder="Текст уведомления"
                      value={row.bodyTemplate}
                      onChange={(e) => updateRow(row.eventId, { bodyTemplate: e.target.value })}
                      rows={3}
                      style={{ width: "100%", resize: "vertical" }}
                    />
                    <Panel style={{ padding: "0.55rem 0.65rem", border: "1px dashed var(--color-border)" }}>
                      <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>
                        Предпросмотр (перевозка {String(PUSH_TEMPLATE_SAMPLE_ITEM.Number)})
                      </Typography.Body>
                      <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600 }}>{preview.title}</Typography.Body>
                      <Typography.Body style={{ fontSize: "0.82rem", marginTop: "0.2rem" }}>{preview.body}</Typography.Body>
                    </Panel>
                  </div>
                ) : (
                  <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginTop: "0.35rem" }}>
                    {preview.body}
                  </Typography.Body>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

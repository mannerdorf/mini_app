import React, { useCallback, useMemo, useState } from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { Bell, Loader2 } from "lucide-react";
import {
  postAdminPushPreview,
  postAdminPushSend,
  type AdminPushAudienceType,
  type AdminPushPreviewResult,
  type AdminPushSendResult,
} from "../../../api/client/admin/pushNotifications";
import { AdminPushSubscribersSection } from "../components/AdminPushSubscribersSection";
import { AdminPushControlJournalSection } from "../components/AdminPushControlJournalSection";
import { AdminPushTemplatesSection } from "../components/AdminPushTemplatesSection";

type Props = {
  adminToken: string;
  onError?: (message: string | null) => void;
};

const AUDIENCE_OPTIONS: Array<{ value: AdminPushAudienceType; label: string; hint: string }> = [
  {
    value: "all_with_token",
    label: "Все с приложением",
    hint: "Пользователи с зарегистрированным FCM-токеном (Android-приложение)",
  },
  {
    value: "logins",
    label: "Конкретные логины",
    hint: "Email-адреса пользователей, по одному в строке или через запятую",
  },
  {
    value: "inns",
    label: "Компании по ИНН",
    hint: "Все логины, привязанные к указанным ИНН в account_companies",
  },
  {
    value: "cargo_in_transit",
    label: "Груз в пути",
    hint: "Пользователи компаний, у которых есть перевозки в статусе «в пути» (cargo_last_state)",
  },
  {
    value: "cargo_accepted",
    label: "Груз принят / готов к выдаче",
    hint: "Компании с перевозками в статусе принят или готов к выдаче",
  },
  {
    value: "cargo_delivered",
    label: "Груз доставлен",
    hint: "Компании с доставленными перевозками",
  },
];

function parseListInput(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function AdminPushNotificationsTab({ adminToken, onError }: Props) {
  const [audienceType, setAudienceType] = useState<AdminPushAudienceType>("all_with_token");
  const [listInput, setListInput] = useState("");
  const [title, setTitle] = useState("HAULZ");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("/");
  const [limit, setLimit] = useState("500");
  const [sendEvent, setSendEvent] = useState<"broadcast" | "app_update">("broadcast");
  const [preview, setPreview] = useState<AdminPushPreviewResult | null>(null);
  const [sendResult, setSendResult] = useState<AdminPushSendResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  const audience = useMemo(() => {
    if (audienceType === "logins") return { type: "logins" as const, logins: parseListInput(listInput) };
    if (audienceType === "inns") return { type: "inns" as const, inns: parseListInput(listInput).map((v) => v.replace(/\D/g, "")) };
    return { type: audienceType };
  }, [audienceType, listInput]);

  const audienceHint = AUDIENCE_OPTIONS.find((o) => o.value === audienceType)?.hint ?? "";
  const needsListInput = audienceType === "logins" || audienceType === "inns";

  const runPreview = useCallback(async () => {
    onError?.(null);
    setPreviewLoading(true);
    setSendResult(null);
    try {
      const result = await postAdminPushPreview(adminToken, audience);
      setPreview(result);
      if (!result.fcmConfigured) {
        onError?.("FCM не настроен на сервере (FIREBASE_SERVICE_ACCOUNT_JSON)");
      }
    } catch (e: unknown) {
      setPreview(null);
      onError?.((e as Error)?.message || "Ошибка предпросмотра");
    } finally {
      setPreviewLoading(false);
    }
  }, [adminToken, audience, onError]);

  const runSend = useCallback(
    async (dryRun: boolean) => {
      onError?.(null);
      setSendLoading(true);
      try {
        const limitNum = Math.max(1, Math.min(5000, parseInt(limit, 10) || 500));
        const result = await postAdminPushSend(adminToken, {
          audience,
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || "/",
          dryRun,
          limit: limitNum,
          event: sendEvent,
        });
        setSendResult(result);
        if (!dryRun) setConfirmSend(false);
      } catch (e: unknown) {
        setSendResult(null);
        onError?.((e as Error)?.message || "Ошибка отправки");
      } finally {
        setSendLoading(false);
      }
    },
    [adminToken, audience, title, body, url, limit, sendEvent, onError],
  );

  const applyAppUpdateTemplate = useCallback(() => {
    setSendEvent("app_update");
    setTitle("HAULZ");
    setBody("Вышла новая версия — обновите приложение");
    setUrl("/profile");
    setConfirmSend(false);
  }, []);

  const canSend =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (!needsListInput || listInput.trim().length > 0);

  return (
    <>
    <AdminPushSubscribersSection adminToken={adminToken} onError={onError} />
    <AdminPushTemplatesSection adminToken={adminToken} onError={onError} />
    <AdminPushControlJournalSection adminToken={adminToken} onError={onError} />
    <Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)" }}>
      <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem" }}>
        <Bell className="w-5 h-5" />
        <Typography.Body style={{ fontWeight: 600 }}>Push-уведомления</Typography.Body>
      </Flex>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
        Ручная рассылка push в Android-приложение HAULZ. Получат только пользователи с активным FCM-токеном.
      </Typography.Body>

      <Typography.Body style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.35rem" }}>Аудитория</Typography.Body>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
          gap: "0.45rem",
          marginBottom: "0.75rem",
        }}
      >
        {AUDIENCE_OPTIONS.map((option) => (
          <label
            key={option.value}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.4rem",
              padding: "0.55rem 0.65rem",
              border: `1px solid ${audienceType === option.value ? "var(--color-primary-blue)" : "var(--color-border)"}`,
              borderRadius: "8px",
              cursor: "pointer",
              background: audienceType === option.value ? "rgba(59, 130, 246, 0.08)" : undefined,
            }}
          >
            <input
              type="radio"
              name="push-audience"
              checked={audienceType === option.value}
              onChange={() => {
                setAudienceType(option.value);
                setPreview(null);
                setSendResult(null);
                setConfirmSend(false);
              }}
              style={{ marginTop: "0.15rem" }}
            />
            <span>
              <Typography.Body style={{ fontSize: "0.85rem", fontWeight: 600 }}>{option.label}</Typography.Body>
            </span>
          </label>
        ))}
      </div>
      {audienceHint ? (
        <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
          {audienceHint}
        </Typography.Body>
      ) : null}

      {needsListInput ? (
        <textarea
          className="admin-form-input"
          placeholder={audienceType === "logins" ? "login1@example.com\nlogin2@example.com" : "7701234567\n7707654321"}
          value={listInput}
          onChange={(e) => {
            setListInput(e.target.value);
            setPreview(null);
            setSendResult(null);
          }}
          rows={4}
          style={{ width: "100%", marginBottom: "0.75rem", resize: "vertical" }}
        />
      ) : null}

      <Typography.Body style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.35rem" }}>Сообщение</Typography.Body>
      <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.55rem" }}>
        <Button
          type="button"
          className="filter-button"
          onClick={applyAppUpdateTemplate}
          style={
            sendEvent === "app_update"
              ? { background: "rgba(59, 130, 246, 0.12)", borderColor: "var(--color-primary-blue)" }
              : undefined
          }
        >
          Шаблон: новая версия
        </Button>
        {sendEvent === "app_update" ? (
          <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)" }}>
            Событие app_update — получат только с включённым пунктом «Новая версия приложения»
          </Typography.Body>
        ) : null}
      </Flex>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))", gap: "0.55rem", marginBottom: "0.75rem" }}>
        <input
          className="admin-form-input"
          placeholder="Заголовок"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="admin-form-input"
          placeholder="Ссылка в приложении (например /cargo)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          className="admin-form-input"
          placeholder="Лимит получателей (макс. 5000)"
          value={limit}
          onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
        />
      </div>
      <textarea
        className="admin-form-input"
        placeholder="Текст уведомления"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        style={{ width: "100%", marginBottom: "0.75rem", resize: "vertical" }}
      />

      <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
        <Button type="button" className="filter-button" disabled={previewLoading || !canSend} onClick={() => void runPreview()}>
          {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
          Предпросмотр
        </Button>
        <Button
          type="button"
          className="filter-button"
          disabled={sendLoading || !canSend}
          onClick={() => void runSend(true)}
        >
          Проверка (dry run)
        </Button>
        {!confirmSend ? (
          <Button
            type="button"
            className="filter-button"
            disabled={sendLoading || !canSend}
            onClick={() => setConfirmSend(true)}
            style={{ background: "var(--color-primary-blue)", color: "white" }}
          >
            Отправить
          </Button>
        ) : (
          <>
            <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-error, #dc2626)" }}>
              Подтвердите отправку push {preview ? `(${preview.withToken} получателей)` : ""}
            </Typography.Body>
            <Button
              type="button"
              className="filter-button"
              disabled={sendLoading || !canSend}
              onClick={() => void runSend(false)}
              style={{ background: "#dc2626", color: "white" }}
            >
              {sendLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} /> : null}
              Да, отправить
            </Button>
            <Button type="button" className="filter-button" disabled={sendLoading} onClick={() => setConfirmSend(false)}>
              Отмена
            </Button>
          </>
        )}
      </Flex>

      {preview ? (
        <Panel style={{ padding: "0.75rem", border: "1px solid var(--color-border)", marginBottom: "0.75rem", background: "var(--color-bg-secondary, #f8fafc)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Предпросмотр аудитории</Typography.Body>
          <Typography.Body style={{ fontSize: "0.82rem" }}>
            Всего в выборке: {preview.recipientsTotal}. С FCM-токеном: {preview.withToken}. Без токена (не получат):{" "}
            {preview.withoutToken}.
          </Typography.Body>
          {preview.fcmConfigured === false ? (
            <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-error, #dc2626)", marginTop: "0.35rem" }}>
              FCM на сервере не настроен — отправка не сработает.
            </Typography.Body>
          ) : null}
          {preview.sampleLogins.length > 0 ? (
            <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginTop: "0.35rem" }}>
              Примеры: {preview.sampleLogins.join(", ")}
              {preview.withToken > preview.sampleLogins.length ? " …" : ""}
            </Typography.Body>
          ) : null}
        </Panel>
      ) : null}

      {sendResult ? (
        <Panel style={{ padding: "0.75rem", border: "1px solid var(--color-border)", background: "var(--color-bg-secondary, #f8fafc)" }}>
          <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
            {sendResult.dryRun ? "Результат проверки" : "Результат отправки"}
          </Typography.Body>
          <Typography.Body style={{ fontSize: "0.82rem" }}>
            {sendResult.dryRun
              ? `Будет отправлено: ${sendResult.selected}. Без токена: ${sendResult.skippedNoToken}.`
              : `Отправлено пользователям: ${sendResult.sent}, ошибок: ${sendResult.failed}, устройств: ${sendResult.devicesSent ?? 0}. Без токена: ${sendResult.skippedNoToken}.`}
            {sendResult.truncated ? " Достигнут лимит получателей." : ""}
          </Typography.Body>
          {sendResult.failures && sendResult.failures.length > 0 ? (
            <textarea
              readOnly
              value={sendResult.failures.map((f) => `${f.login}: ${f.error || "error"}`).join("\n")}
              rows={4}
              style={{ width: "100%", marginTop: "0.5rem", fontSize: "0.78rem" }}
            />
          ) : null}
        </Panel>
      ) : null}
    </Panel>
    </>
  );
}

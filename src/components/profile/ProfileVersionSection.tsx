import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { formatDateTime } from "../../lib/dateUtils";
import {
  checkAppReleaseUpdate,
  getAppVersionSnapshot,
  openAndroidReleaseDownload,
  reloadWebApp,
  type AppUpdateCheckResult,
  type AppVersionSnapshot,
} from "../../lib/appVersionInfo";

type Props = {
  onBack: () => void;
};

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Flex align="flex-start" justify="space-between" style={{ gap: "1rem", padding: "0.55rem 0" }}>
      <Typography.Body style={{ fontSize: "0.84rem", color: "var(--color-text-secondary)", margin: 0, flex: "0 0 42%" }}>
        {label}
      </Typography.Body>
      <Typography.Body
        component="div"
        style={{ fontSize: "0.84rem", color: "var(--color-text-primary)", margin: 0, flex: 1, textAlign: "right", wordBreak: "break-word" }}
      >
        {value}
      </Typography.Body>
    </Flex>
  );
}

export function ProfileVersionSection({ onBack }: Props) {
  const [snapshot, setSnapshot] = useState<AppVersionSnapshot | null>(null);
  const [checkResult, setCheckResult] = useState<AppUpdateCheckResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAppVersionSnapshot()
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage("Не удалось загрузить сведения о версии");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setChecking(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const result = await checkAppReleaseUpdate(true);
      setCheckResult(result);
      setSnapshot(result.snapshot);

      if (!result.remote) {
        setErrorMessage("Не удалось получить version.json с сервера обновлений");
        return;
      }

      if (result.snapshot.isNativeAndroid) {
        if (result.updateAvailable) {
          setStatusMessage(`Доступна версия ${result.remote.versionName}. Начинаем загрузку APK…`);
          openAndroidReleaseDownload(result.remote.apkUrl);
          return;
        }
        setStatusMessage("Установлена актуальная версия приложения");
        return;
      }

      setStatusMessage(
        `В репозитории APK: ${result.remote.versionName} (сборка ${result.remote.versionCode}). Обновляем веб-интерфейс…`,
      );
      window.setTimeout(() => reloadWebApp(), 600);
    } catch {
      setErrorMessage("Не удалось проверить обновления");
    } finally {
      setChecking(false);
    }
  }, []);

  const installVersion = snapshot
    ? snapshot.install.buildNumber != null
      ? `${snapshot.install.versionName} (сборка ${snapshot.install.buildNumber})`
      : snapshot.install.versionName
    : "—";

  const remoteVersion = checkResult?.remote
    ? `${checkResult.remote.versionName} (сборка ${checkResult.remote.versionCode})`
    : "—";

  return (
    <div className="w-full">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline className="text-page-title">Версия</Typography.Headline>
      </Flex>

      {loading ? (
        <Panel className="cargo-card" style={{ padding: "1.25rem", display: "flex", justifyContent: "center" }}>
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--color-text-secondary)" }} />
        </Panel>
      ) : (
        <>
          <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
            <Typography.Body style={{ fontWeight: 700, marginBottom: "0.35rem" }}>Текущая установка</Typography.Body>
            <InfoRow label="Версия" value={installVersion} />
            <InfoRow label="Платформа" value={snapshot?.platformLabel || "—"} />
            {snapshot?.install.appId ? <InfoRow label="ID приложения" value={snapshot.install.appId} /> : null}
            <InfoRow label="API" value={snapshot?.apiOrigin || "—"} />
          </Panel>

          <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
            <Typography.Body style={{ fontWeight: 700, marginBottom: "0.35rem" }}>Репозиторий обновлений</Typography.Body>
            <InfoRow label="Сервер" value={snapshot?.releaseOrigin || "—"} />
            <InfoRow label="Манифест" value={snapshot?.releaseManifestUrl || "—"} />
            <InfoRow label="Версия в репозитории" value={remoteVersion} />
            {checkResult?.remote?.publishedAt ? (
              <InfoRow label="Опубликовано" value={formatDateTime(checkResult.remote.publishedAt)} />
            ) : null}
            {checkResult?.remote?.sha256 ? (
              <InfoRow label="SHA-256" value={<code style={{ fontSize: "0.72rem" }}>{checkResult.remote.sha256}</code>} />
            ) : null}
            {checkResult?.remote?.releaseNotes ? (
              <Typography.Body style={{ marginTop: "0.65rem", fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
                {checkResult.remote.releaseNotes}
              </Typography.Body>
            ) : null}
          </Panel>

          <Panel className="cargo-card" style={{ padding: "1rem" }}>
            <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.85rem" }}>
              {snapshot?.isNativeAndroid
                ? "Кнопка проверяет version.json на app.haulz.space и предложит скачать APK, если доступна более новая сборка."
                : "Кнопка проверяет version.json репозитория APK и обновляет веб-интерфейс с сервера."}
            </Typography.Body>
            <Button type="button" className="button-primary" onClick={() => void handleCheckUpdate()} disabled={checking}>
              {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span style={{ marginLeft: "0.35rem" }}>{checking ? "Проверка…" : "Обновить"}</span>
            </Button>
            {statusMessage ? (
              <Typography.Body style={{ marginTop: "0.75rem", fontSize: "0.84rem", color: "var(--color-text-primary)" }}>
                {statusMessage}
              </Typography.Body>
            ) : null}
            {errorMessage ? (
              <Typography.Body style={{ marginTop: "0.75rem", fontSize: "0.84rem", color: "var(--color-error)" }}>
                {errorMessage}
              </Typography.Body>
            ) : null}
          </Panel>
        </>
      )}
    </div>
  );
}

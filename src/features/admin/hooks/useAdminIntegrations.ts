import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAdminIntegrationHealth, type AdminIntegrationHealth } from "../../../api/client/admin/journal";
import {
  fetchAdminYandexTranslateConfig,
  fetchAdminZvonobotConfig,
  fetchDocumentCacheBackfillStatus,
  fetchPartnerApiHealth,
  postAdminSendlkSync,
  postAdminYandexTranslateSandbox,
  postAdminZvonobotSandbox,
  postDocumentCacheBackfill,
  type DocumentCacheBackfillStatus,
} from "../../../api/client/admin/integrations";

export function useAdminIntegrations(adminToken: string | null) {
  const [healthDays, setHealthDays] = useState(30);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthFetchTrigger, setHealthFetchTrigger] = useState(0);
  const [health, setHealth] = useState<AdminIntegrationHealth | null>(null);
  const [sendLkLoading, setSendLkLoading] = useState(false);
  const [sendLkResult, setSendLkResult] = useState<string | null>(null);
  const [historyDays, setHistoryDays] = useState(365);
  const [stepDays, setStepDays] = useState(30);
  const [maxSteps, setMaxSteps] = useState(3);
  const [backfill, setBackfill] = useState<DocumentCacheBackfillStatus | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const currentMonthRef = useRef<HTMLTableRowElement | null>(null);
  const [zvonobotConfigured, setZvonobotConfigured] = useState<boolean | null>(null);
  const [zvonobotKeyHint, setZvonobotKeyHint] = useState("");
  const [zvonobotLoading, setZvonobotLoading] = useState(false);
  const [zvonobotError, setZvonobotError] = useState("");
  const [zvonobotResult, setZvonobotResult] = useState("");
  const [zvonobotPhone, setZvonobotPhone] = useState("");
  const [zvonobotOutgoingPhone, setZvonobotOutgoingPhone] = useState("");
  const [zvonobotRecordId, setZvonobotRecordId] = useState("");
  const [zvonobotRecordText, setZvonobotRecordText] = useState("");
  const [zvonobotRecordGender, setZvonobotRecordGender] = useState<"0" | "1">("0");
  const [zvonobotPlannedAt, setZvonobotPlannedAt] = useState("");
  const [zvonobotApiCallIds, setZvonobotApiCallIds] = useState("");
  const [partnerApiHealthJson, setPartnerApiHealthJson] = useState("");
  const [yandexConfigured, setYandexConfigured] = useState<boolean | null>(null);
  const [yandexKeyHint, setYandexKeyHint] = useState("");
  const [yandexFolderConfigured, setYandexFolderConfigured] = useState(false);
  const [yandexFolderHint, setYandexFolderHint] = useState("");
  const [yandexOpenaiConfigured, setYandexOpenaiConfigured] = useState(false);
  const [yandexPreferredProvider, setYandexPreferredProvider] = useState<"yandex" | "openai" | null>(null);
  const [yandexLoading, setYandexLoading] = useState(false);
  const [yandexError, setYandexError] = useState("");
  const [yandexResult, setYandexResult] = useState("");
  const [yandexInput, setYandexInput] = useState("jewelry components\nusb adapter");

  useEffect(() => {
    if (!adminToken) return;
    setHealthLoading(true);
    fetchAdminIntegrationHealth(adminToken, healthDays)
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setHealthLoading(false));
  }, [adminToken, healthFetchTrigger, healthDays]);

  const runSendLkBulkSync = useCallback(async () => {
    if (!adminToken) return;
    setSendLkLoading(true);
    setSendLkResult(null);
    try {
      const data = await postAdminSendlkSync(adminToken);
      setSendLkResult(`Выгрузка завершена: выбрано ${data.selected}, отправлено ${data.sent}, ошибок ${data.failed}`);
      setHealthFetchTrigger((prev) => prev + 1);
    } catch (e: unknown) {
      setSendLkResult((e as Error)?.message || "Ошибка выгрузки SendLK");
    } finally {
      setSendLkLoading(false);
    }
  }, [adminToken]);

  const loadBackfillStatus = useCallback(async () => {
    if (!adminToken) return;
    setBackfillLoading(true);
    setBackfillError(null);
    try {
      const data = await fetchDocumentCacheBackfillStatus(adminToken);
      setBackfill(data);
    } catch (e: unknown) {
      setBackfillError((e as Error)?.message || "Ошибка загрузки статуса кэша");
      setBackfill(null);
    } finally {
      setBackfillLoading(false);
    }
  }, [adminToken]);

  const runBackfill = useCallback(async (action: "reset" | "step" | "reset_and_run") => {
    if (!adminToken) return;
    setBackfillRunning(true);
    setBackfillError(null);
    try {
      const data = await postDocumentCacheBackfill(adminToken, {
        action,
        historyDays,
        stepDays,
        maxSteps,
      });
      setBackfill(data);
    } catch (e: unknown) {
      setBackfillError((e as Error)?.message || "Ошибка backfill кэша");
    } finally {
      setBackfillRunning(false);
    }
  }, [adminToken, historyDays, stepDays, maxSteps]);

  useEffect(() => {
    if (!adminToken) return;
    void loadBackfillStatus();
  }, [adminToken, healthFetchTrigger, loadBackfillStatus]);

  useEffect(() => {
    if (!backfill?.coverageByMonth?.length) return;
    currentMonthRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [backfill?.state.nextFrom, backfill?.coverageByMonth]);

  const runZvonobotAction = useCallback(async (
    action: "create" | "get" | "userInfo" | "getPhones" | "getAvailableLanguages",
    payload: Record<string, unknown> = {},
  ) => {
    if (!adminToken) return;
    setZvonobotLoading(true);
    setZvonobotError("");
    setZvonobotResult("");
    try {
      const data = await postAdminZvonobotSandbox(adminToken, action, payload);
      setZvonobotResult(JSON.stringify(data, null, 2));
    } catch (e: unknown) {
      setZvonobotError((e as Error)?.message || "Ошибка запроса к Zvonobot");
    } finally {
      setZvonobotLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    if (!adminToken) return;
    fetchAdminZvonobotConfig(adminToken)
      .then(({ configured, keyHint }) => {
        setZvonobotConfigured(configured);
        setZvonobotKeyHint(keyHint);
      })
      .catch(() => {
        setZvonobotConfigured(false);
        setZvonobotKeyHint("");
      });
  }, [adminToken]);

  useEffect(() => {
    fetchPartnerApiHealth()
      .then((data) => setPartnerApiHealthJson(JSON.stringify(data, null, 2)))
      .catch(() => setPartnerApiHealthJson(JSON.stringify({ error: "Не удалось загрузить /api/partner/v1/health" }, null, 2)));
  }, [healthFetchTrigger]);

  const runYandexTranslate = useCallback(async (mode: "direct" | "productNames" | "fivepost") => {
    if (!adminToken) return;
    const texts = yandexInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (texts.length === 0) {
      setYandexError("Введите хотя бы одну строку для перевода");
      return;
    }
    setYandexLoading(true);
    setYandexError("");
    setYandexResult("");
    try {
      const data = await postAdminYandexTranslateSandbox(adminToken, mode, texts);
      setYandexResult(JSON.stringify(data, null, 2));
    } catch (e: unknown) {
      setYandexError((e as Error)?.message || "Ошибка перевода");
    } finally {
      setYandexLoading(false);
    }
  }, [adminToken, yandexInput]);

  useEffect(() => {
    if (!adminToken) return;
    fetchAdminYandexTranslateConfig(adminToken)
      .then((cfg) => {
        setYandexConfigured(cfg.yandexConfigured);
        setYandexKeyHint(cfg.yandexKeyHint);
        setYandexFolderConfigured(cfg.folderIdConfigured);
        setYandexFolderHint(cfg.folderIdHint);
        setYandexOpenaiConfigured(cfg.openaiConfigured);
        setYandexPreferredProvider(cfg.preferredProvider);
      })
      .catch(() => {
        setYandexConfigured(false);
        setYandexKeyHint("");
        setYandexFolderConfigured(false);
        setYandexFolderHint("");
        setYandexOpenaiConfigured(false);
        setYandexPreferredProvider(null);
      });
  }, [adminToken]);

  const refreshHealth = useCallback(() => {
    setHealthFetchTrigger((x) => x + 1);
  }, []);

  return {
    healthDays,
    setHealthDays,
    healthLoading,
    health,
    refreshHealth,
    sendLkLoading,
    sendLkResult,
    runSendLkBulkSync,
    historyDays,
    setHistoryDays,
    stepDays,
    setStepDays,
    maxSteps,
    setMaxSteps,
    backfill,
    backfillLoading,
    backfillRunning,
    backfillError,
    currentMonthRef,
    loadBackfillStatus,
    runBackfill,
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
    partnerApiHealthJson,
    yandexConfigured,
    yandexKeyHint,
    yandexFolderConfigured,
    yandexFolderHint,
    yandexOpenaiConfigured,
    yandexPreferredProvider,
    yandexLoading,
    yandexError,
    yandexResult,
    yandexInput,
    setYandexInput,
    runYandexTranslate,
  };
}

export type AdminIntegrationsState = ReturnType<typeof useAdminIntegrations>;

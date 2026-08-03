import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAdminIntegrationHealth, type AdminIntegrationHealth } from "../../../api/client/admin/journal";
import {
  fetchAdminZvonobotConfig,
  fetchDocumentCacheBackfillStatus,
  postAdminSendlkSync,
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
    fetch("/api/partner/v1/health")
      .then((r) => r.json())
      .then((data) => setPartnerApiHealthJson(JSON.stringify(data, null, 2)))
      .catch(() => setPartnerApiHealthJson(JSON.stringify({ error: "Не удалось загрузить /api/partner/v1/health" }, null, 2)));
  }, [healthFetchTrigger]);

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
  };
}

export type AdminIntegrationsState = ReturnType<typeof useAdminIntegrations>;

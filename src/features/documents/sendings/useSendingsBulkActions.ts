import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { postSendingsEorStatus } from "../../../api/client/documents";
import type { SanctionCheckResult } from "../../../lib/sanctions";
import { applySendingsPlanDateForCargo } from "./sendingsPlanDateAction";
import type { EorStatus } from "./sendingsTypes";

export type VisibleSendingRowMeta = {
  rowKey: string;
  row: unknown;
  sendingNumber: string;
  sendingDate: string;
  cargoNumbers: string[];
};

type Auth = { login?: string; password?: string } | null | undefined;

type Params = {
  visibleSendingMeta: VisibleSendingRowMeta[];
  canRunSanctionsCheck: boolean;
  canEditEor: boolean;
  canEditPlanDate: boolean;
  getSendingSanctionResult: (row: unknown) => SanctionCheckResult;
  setEorStatusMap: Dispatch<SetStateAction<Record<string, EorStatus[]>>>;
  setSendingSanctionMap: Dispatch<SetStateAction<Record<string, SanctionCheckResult>>>;
  auth: Auth;
  effectiveActiveInn: string | null | undefined;
};

export function useSendingsBulkActions({
  visibleSendingMeta,
  canRunSanctionsCheck,
  canEditEor,
  canEditPlanDate,
  getSendingSanctionResult,
  setEorStatusMap,
  setSendingSanctionMap,
  auth,
  effectiveActiveInn,
}: Params) {
  const [selectedSendingRowKeys, setSelectedSendingRowKeys] = useState<Set<string>>(() => new Set());
  const [bulkEorMenuOpen, setBulkEorMenuOpen] = useState(false);
  const [bulkPlanDateOpen, setBulkPlanDateOpen] = useState(false);
  const [bulkPlanDateValue, setBulkPlanDateValue] = useState("");
  const [bulkSendingActionLoading, setBulkSendingActionLoading] = useState(false);
  const [bulkSendingActionError, setBulkSendingActionError] = useState<string | null>(null);
  const [bulkSendingActionInfo, setBulkSendingActionInfo] = useState<string | null>(null);
  const [selectedByCustomerSummaryKeys, setSelectedByCustomerSummaryKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [byCustomerPlanDateOpen, setByCustomerPlanDateOpen] = useState(false);
  const [byCustomerPlanDateValue, setByCustomerPlanDateValue] = useState("");
  const [byCustomerActionLoading, setByCustomerActionLoading] = useState(false);
  const [byCustomerActionError, setByCustomerActionError] = useState<string | null>(null);
  const [byCustomerActionInfo, setByCustomerActionInfo] = useState<string | null>(null);
  const [expandedByCustomerKey, setExpandedByCustomerKey] = useState<string | null>(null);

  const selectedVisibleSendingCount = useMemo(
    () => visibleSendingMeta.reduce((acc, row) => acc + (selectedSendingRowKeys.has(row.rowKey) ? 1 : 0), 0),
    [visibleSendingMeta, selectedSendingRowKeys],
  );
  const allVisibleSendingsSelected =
    visibleSendingMeta.length > 0 && selectedVisibleSendingCount === visibleSendingMeta.length;

  useEffect(() => {
    if (selectedSendingRowKeys.size === 0) return;
    const visibleKeys = new Set(visibleSendingMeta.map((row) => row.rowKey));
    setSelectedSendingRowKeys((prev) => {
      const next = new Set<string>();
      prev.forEach((key) => {
        if (visibleKeys.has(key)) next.add(key);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [visibleSendingMeta, selectedSendingRowKeys.size]);

  const selectedSendingRowsMeta = useMemo(
    () => visibleSendingMeta.filter((row) => selectedSendingRowKeys.has(row.rowKey)),
    [visibleSendingMeta, selectedSendingRowKeys],
  );

  const resetBulkUiState = useCallback(() => {
    setSelectedSendingRowKeys(new Set());
    setBulkEorMenuOpen(false);
    setBulkPlanDateOpen(false);
    setBulkSendingActionLoading(false);
    setBulkSendingActionError(null);
    setBulkSendingActionInfo(null);
    setSelectedByCustomerSummaryKeys(new Set());
    setByCustomerPlanDateOpen(false);
    setByCustomerPlanDateValue("");
    setByCustomerActionLoading(false);
    setByCustomerActionError(null);
    setByCustomerActionInfo(null);
  }, []);

  const applyBulkSanctionsCheck = useCallback(() => {
    if (!canRunSanctionsCheck || selectedSendingRowsMeta.length === 0) return;
    const next: Record<string, SanctionCheckResult> = {};
    selectedSendingRowsMeta.forEach((row) => {
      next[row.rowKey] = getSendingSanctionResult(row.row);
    });
    setSendingSanctionMap((prev) => ({ ...prev, ...next }));
    const sanctionedCount = Object.values(next).filter((item) => item.verdict === "sanctioned").length;
    const reviewCount = Object.values(next).filter((item) => item.verdict === "review").length;
    setBulkSendingActionError(null);
    setBulkSendingActionInfo(
      `Санкции проверены: ${selectedSendingRowsMeta.length}. Санкции: ${sanctionedCount}, проверить: ${reviewCount}.`,
    );
  }, [canRunSanctionsCheck, selectedSendingRowsMeta, getSendingSanctionResult, setSendingSanctionMap]);

  const applyBulkEorStatus = useCallback(
    async (status: EorStatus) => {
      if (!canEditEor || selectedSendingRowsMeta.length === 0) return;
      setBulkSendingActionLoading(true);
      setBulkSendingActionError(null);
      setBulkSendingActionInfo(null);
      try {
        const settled = await Promise.allSettled(
          selectedSendingRowsMeta.map(async (row) => {
            await postSendingsEorStatus({
              login: auth?.login,
              password: auth?.password,
              inn: effectiveActiveInn ?? null,
              rowKey: row.rowKey,
              statuses: [status],
              sendingNumber: row.sendingNumber || null,
              sendingDate: row.sendingDate || null,
            });
            return row.rowKey;
          }),
        );
        const successKeys = settled
          .filter((item): item is PromiseFulfilledResult<string> => item.status === "fulfilled")
          .map((item) => item.value);
        if (successKeys.length > 0) {
          setEorStatusMap((prev) => {
            const next = { ...prev };
            successKeys.forEach((rowKey) => {
              next[rowKey] = [status];
            });
            return next;
          });
        }
        const failed = settled.length - successKeys.length;
        if (failed > 0) {
          setBulkSendingActionError(`EOR обновлён частично: ${successKeys.length} из ${settled.length}.`);
        } else {
          setBulkSendingActionInfo(`EOR обновлён для ${successKeys.length} отправок.`);
        }
        setBulkEorMenuOpen(false);
      } catch (e: unknown) {
        setBulkSendingActionError(String((e as Error)?.message || "Не удалось обновить EOR."));
      } finally {
        setBulkSendingActionLoading(false);
      }
    },
    [canEditEor, selectedSendingRowsMeta, auth?.login, auth?.password, effectiveActiveInn, setEorStatusMap],
  );

  const applyBulkPlanDate = useCallback(async () => {
    if (!canEditPlanDate || selectedSendingRowsMeta.length === 0) return;
    const cargoNumbers = Array.from(
      new Set(
        selectedSendingRowsMeta
          .flatMap((row) => {
            const direct = String(row.sendingNumber || "").trim();
            if (direct) return [direct];
            return row.cargoNumbers.map((v) => String(v).trim()).filter(Boolean);
          })
          .filter(Boolean),
      ),
    );
    if (cargoNumbers.length === 0) {
      setBulkSendingActionError("По выбранным отправкам не найдены номера перевозок.");
      return;
    }
    await applySendingsPlanDateForCargo(bulkPlanDateValue, cargoNumbers, {
      setLoading: setBulkSendingActionLoading,
      setError: setBulkSendingActionError,
      setInfo: setBulkSendingActionInfo,
      onClose: () => setBulkPlanDateOpen(false),
    });
  }, [canEditPlanDate, selectedSendingRowsMeta, bulkPlanDateValue]);

  const applyByCustomerPlanDate = useCallback(
    async (cargoNumbers: string[], groupBy: "customer" | "receiver") => {
      if (!canEditPlanDate) return;
      const unique = Array.from(new Set(cargoNumbers.map((c) => String(c).trim()).filter(Boolean)));
      if (unique.length === 0) {
        setByCustomerActionError(
          groupBy === "receiver"
            ? "По выбранным получателям не найдены номера перевозок."
            : "По выбранным заказчикам не найдены номера перевозок.",
        );
        return;
      }
      await applySendingsPlanDateForCargo(byCustomerPlanDateValue, unique, {
        setLoading: setByCustomerActionLoading,
        setError: setByCustomerActionError,
        setInfo: setByCustomerActionInfo,
        onClose: () => setByCustomerPlanDateOpen(false),
      });
    },
    [canEditPlanDate, byCustomerPlanDateValue],
  );

  return {
    selectedSendingRowKeys,
    setSelectedSendingRowKeys,
    bulkEorMenuOpen,
    setBulkEorMenuOpen,
    bulkPlanDateOpen,
    setBulkPlanDateOpen,
    bulkPlanDateValue,
    setBulkPlanDateValue,
    bulkSendingActionLoading,
    bulkSendingActionError,
    bulkSendingActionInfo,
    selectedByCustomerSummaryKeys,
    setSelectedByCustomerSummaryKeys,
    byCustomerPlanDateOpen,
    setByCustomerPlanDateOpen,
    byCustomerPlanDateValue,
    setByCustomerPlanDateValue,
    byCustomerActionLoading,
    setByCustomerActionLoading,
    byCustomerActionError,
    setByCustomerActionError,
    byCustomerActionInfo,
    setByCustomerActionInfo,
    expandedByCustomerKey,
    setExpandedByCustomerKey,
    selectedVisibleSendingCount,
    allVisibleSendingsSelected,
    selectedSendingRowsMeta,
    applyBulkSanctionsCheck,
    applyBulkEorStatus,
    applyBulkPlanDate,
    applyByCustomerPlanDate,
    resetBulkUiState,
  };
}

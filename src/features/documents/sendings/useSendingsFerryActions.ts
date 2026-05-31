import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { fetchMarinesiaShipEta, postSendingsFerryAssignment } from "../../../api/client/documents";

type FerryEntry = { ferry_id: number; ferry_name: string; eta: string | null };
type FerryListItem = { id: number; name: string; mmsi: string };
type Auth = { login?: string; password?: string } | null | undefined;

type Params = {
  auth: Auth;
  ferriesList: FerryListItem[];
  sendingsFerryMap: Record<string, FerryEntry>;
  setSendingsFerryMap: Dispatch<SetStateAction<Record<string, FerryEntry>>>;
  setFerryEtaLoadingByRow: Dispatch<SetStateAction<Record<string, boolean>>>;
  effectiveActiveInn: string | null | undefined;
};

export function useSendingsFerryActions({
  auth,
  ferriesList,
  sendingsFerryMap,
  setSendingsFerryMap,
  setFerryEtaLoadingByRow,
  effectiveActiveInn,
}: Params) {
  const [sendingsFerryActionError, setSendingsFerryActionError] = useState<string | null>(null);

  const getSendingsFerryEntry = useCallback(
    (rowKey: string, number: string) => {
      const withNormalized = (raw: string) => {
        const base = String(raw ?? "").trim();
        if (!base) return [] as string[];
        const compact = base.replace(/\D+/g, "");
        return compact && compact !== base ? [base, compact] : [base];
      };
      const candidates = [...withNormalized(rowKey), ...withNormalized(number)];
      for (const candidate of Array.from(new Set(candidates))) {
        const entry = sendingsFerryMap[candidate];
        if (entry) return entry;
      }
      return null;
    },
    [sendingsFerryMap],
  );

  const handleFerrySelect = useCallback(
    async (rowKey: string, ferryIdStr: string, effectiveInn: string | null) => {
      setSendingsFerryActionError(null);
      const parsed = ferryIdStr.trim() ? parseInt(ferryIdStr, 10) : NaN;
      const ferryId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      const ferry = ferryId != null ? ferriesList.find((f) => Number(f.id) === ferryId) : null;
      if (!ferry && ferryId != null) return;

      const keys = [rowKey, rowKey.replace(/\D/g, "")].filter(Boolean);
      const optimisticEntry =
        ferryId && ferry ? { ferry_id: ferryId, ferry_name: ferry.name, eta: null as string | null } : null;
      setSendingsFerryMap((prev) => {
        const next = { ...prev };
        keys.forEach((k) => {
          if (optimisticEntry) next[k] = optimisticEntry;
          else delete next[k];
        });
        return next;
      });

      setFerryEtaLoadingByRow((prev) => ({ ...prev, [rowKey]: true }));
      try {
        const eta = ferry ? await fetchMarinesiaShipEta(ferry.mmsi) : null;
        await postSendingsFerryAssignment({
          login: auth?.login,
          password: auth?.password,
          rowKey,
          ferryId: ferryId ?? undefined,
          eta,
          inn: effectiveInn ?? undefined,
        });
        setSendingsFerryMap((prev) => {
          const next = { ...prev };
          const entry =
            ferryId && ferry ? { ferry_id: ferryId, ferry_name: ferry.name, eta } : null;
          keys.forEach((k) => {
            if (entry) next[k] = entry;
            else delete next[k];
          });
          return next;
        });
      } catch (err) {
        setSendingsFerryMap((prev) => {
          const next = { ...prev };
          keys.forEach((k) => delete next[k]);
          return next;
        });
        setSendingsFerryActionError(String((err as Error)?.message ?? "Не удалось сохранить паром"));
      } finally {
        setFerryEtaLoadingByRow((prev) => {
          const next = { ...prev };
          delete next[rowKey];
          return next;
        });
      }
    },
    [auth?.login, auth?.password, ferriesList, setSendingsFerryMap, setFerryEtaLoadingByRow],
  );

  const resetFerryUiState = useCallback(() => {
    setSendingsFerryActionError(null);
  }, []);

  return {
    sendingsFerryActionError,
    setSendingsFerryActionError,
    getSendingsFerryEntry,
    handleFerrySelect,
    resetFerryUiState,
  };
}

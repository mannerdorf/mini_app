import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
  fetchFerriesList,
  fetchSendingsEorMap,
  fetchSendingsFerryMap,
} from "../../../api/client/documents";
import type { EorStatus } from "./sendingsTypes";

type Auth = { login?: string; password?: string } | null | undefined;

type Params = {
  docSection: string;
  showEorColumn: boolean;
  auth: Auth;
  setEorStatusMap: Dispatch<SetStateAction<Record<string, EorStatus[]>>>;
  setFerriesList: Dispatch<
    SetStateAction<{ id: number; name: string; mmsi: string }[]>
  >;
  setSendingsFerryMap: Dispatch<
    SetStateAction<Record<string, { ferry_id: number; ferry_name: string; eta: string | null }>>
  >;
  resetSendingsUiState: () => void;
};

export function useSendingsServerSync({
  docSection,
  showEorColumn,
  auth,
  setEorStatusMap,
  setFerriesList,
  setSendingsFerryMap,
  resetSendingsUiState,
}: Params) {
  useEffect(() => {
    if (!showEorColumn || !auth?.login || !auth?.password) {
      setEorStatusMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const map = await fetchSendingsEorMap({ login: auth.login, password: auth.password });
        if (!cancelled && map) setEorStatusMap(map as Record<string, EorStatus[]>);
      } catch {
        // ignore DB sync errors in UI
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showEorColumn, auth?.login, auth?.password, setEorStatusMap]);

  useEffect(() => {
    if (docSection !== "Отправки") return;
    fetchFerriesList().then(setFerriesList);
  }, [docSection, setFerriesList]);

  useEffect(() => {
    if (docSection !== "Отправки" || !auth?.login || !auth?.password) {
      setSendingsFerryMap({});
      return;
    }
    let cancelled = false;
    fetchSendingsFerryMap(auth.login, auth.password).then((map) => {
      if (!cancelled) setSendingsFerryMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [docSection, auth?.login, auth?.password, setSendingsFerryMap]);

  useEffect(() => {
    if (docSection !== "Отправки") {
      resetSendingsUiState();
    }
  }, [docSection, resetSendingsUiState]);
}

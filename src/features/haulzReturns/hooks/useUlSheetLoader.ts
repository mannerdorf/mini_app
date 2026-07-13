import { useCallback, useState } from "react";
import type { AuthData } from "../../../types";
import { getHaulzReturnsJobSheet, type HaulzReturnsFileMeta } from "../../../api/client/haulzReturns";
import { hydrateUlSheetFromParsed, parseUlBuffer, type HaulzWorkbook } from "../../../lib/haulzReturns";

type UseUlSheetLoaderParams = {
  auth: AuthData | null;
  storedFiles: HaulzReturnsFileMeta[];
  jobId: string | null;
  workbook: HaulzWorkbook | null;
  setWorkbook: React.Dispatch<React.SetStateAction<HaulzWorkbook | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveTab: React.Dispatch<React.SetStateAction<string>>;
};

export function useUlSheetLoader({
  auth,
  storedFiles,
  jobId,
  workbook,
  setWorkbook,
  setError,
  setActiveTab,
}: UseUlSheetLoaderParams) {
  const [loadingUlTab, setLoadingUlTab] = useState<string | null>(null);

  const ensureUlSheetLoaded = useCallback(
    async (tabId: string, currentWorkbook: HaulzWorkbook, currentJobId: string, files: HaulzReturnsFileMeta[]) => {
      if (!auth || !tabId.startsWith("ul-")) return null;
      const ulNumber = tabId.slice(3);
      if (currentWorkbook.excludedUlNumbers?.has(ulNumber)) return null;
      const sheet = currentWorkbook.sheets.find((s) => s.id === tabId);
      if (!sheet || sheet.ulLocallyEdited || (sheet.rows.length > 0 && !sheet.ulDeferred)) return null;

      const fileMeta = files.find(
        (f) =>
          (f.file_role === "ul_prio1" || f.file_role === "ul_prio2") &&
          (f.ul_number === ulNumber || f.original_filename.includes(ulNumber)),
      );
      if (!fileMeta) return null;

      setLoadingUlTab(tabId);
      try {
        const res = await fetch(
          `/api/haulz-returns/job-file-download?jobId=${encodeURIComponent(currentJobId)}&fileId=${encodeURIComponent(fileMeta.id)}`,
          { headers: { "x-login": auth.login, "x-password": auth.password } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = parseUlBuffer(await res.arrayBuffer(), fileMeta.original_filename);
        return (latestWorkbook: HaulzWorkbook) => {
          const prev = latestWorkbook.sheets.find((s) => s.id === tabId);
          const ulSheet = hydrateUlSheetFromParsed(prev, parsed, latestWorkbook.itogControlKeys);
          return {
            ...latestWorkbook,
            sheets: latestWorkbook.sheets.map((s) => (s.id === tabId ? ulSheet : s)),
          };
        };
      } catch (e: unknown) {
        setError((e as Error)?.message || `Не удалось загрузить УЛ ${ulNumber}`);
        return null;
      } finally {
        setLoadingUlTab(null);
      }
    },
    [auth, setError],
  );

  const hydrateDeferredItogSheet = useCallback(
    async (currentWorkbook: HaulzWorkbook, currentJobId: string): Promise<HaulzWorkbook> => {
      if (!auth) return currentWorkbook;
      const itog = currentWorkbook.sheets.find((s) => s.id === "itog");
      if (!itog?.itogDeferred) return currentWorkbook;
      const sheet = await getHaulzReturnsJobSheet(auth, currentJobId, "itog");
      return {
        ...currentWorkbook,
        sheets: currentWorkbook.sheets.map((s) => (s.id === "itog" ? sheet : s)),
      };
    },
    [auth],
  );

  const handleTabSelect = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      if (!workbook || !jobId) return;
      void (async () => {
        const applyLoaded = await ensureUlSheetLoaded(tabId, workbook, jobId, storedFiles);
        if (applyLoaded) setWorkbook(applyLoaded);
      })();
    },
    [workbook, jobId, storedFiles, ensureUlSheetLoaded, setActiveTab, setWorkbook],
  );

  const hydrateAllUlSheets = useCallback(
    async (currentWorkbook: HaulzWorkbook, currentJobId: string): Promise<HaulzWorkbook> => {
      let wb = currentWorkbook;
      for (const sheet of wb.sheets) {
        if (!sheet.id.startsWith("ul-")) continue;
        const applyLoaded = await ensureUlSheetLoaded(sheet.id, wb, currentJobId, storedFiles);
        if (applyLoaded) wb = applyLoaded(wb);
      }
      return wb;
    },
    [ensureUlSheetLoaded, storedFiles],
  );

  return {
    loadingUlTab,
    ensureUlSheetLoaded,
    hydrateDeferredItogSheet,
    handleTabSelect,
    hydrateAllUlSheets,
  };
}

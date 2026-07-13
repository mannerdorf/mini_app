import React, { useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import type { AuthData } from "../types";
import type { HaulzReturnsFileMeta } from "../api/client/haulzReturns";
import { HaulzReturnsWorkbookView } from "../features/haulzReturns/HaulzReturnsWorkbookView";
import { HaulzUlCarrierPanel } from "../features/haulzReturns/HaulzUlCarrierPanel";
import { HaulzUlTdField } from "../features/haulzReturns/HaulzUlTdField";
import { HaulzCustomsPanel } from "../features/haulzReturns/HaulzCustomsPanel";
import { HaulzSessionList } from "../features/haulzReturns/HaulzSessionList";
import { HaulzUploadPanel } from "../features/haulzReturns/HaulzUploadPanel";
import { HaulzWorkbookToolbar } from "../features/haulzReturns/HaulzWorkbookToolbar";
import { useHaulzSession } from "../features/haulzReturns/hooks/useHaulzSession";
import { useHaulzUpload } from "../features/haulzReturns/hooks/useHaulzUpload";
import { useHaulzWorkbook } from "../features/haulzReturns/hooks/useHaulzWorkbook";
import { useUlSheetLoader } from "../features/haulzReturns/hooks/useUlSheetLoader";
import type { HaulzWorkbook } from "../lib/haulzReturns";

type Props = {
  auth: AuthData | null;
  onBack?: () => void;
  pageTitle?: string;
};

export function HaulzReturnsPage({ auth, onBack, pageTitle = "Возврат из КГД" }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [storedFilesCollapsed, setStoredFilesCollapsed] = useState(true);

  const sessionRef = useRef<ReturnType<typeof useHaulzSession> | null>(null);
  const setWorkbookRef = useRef<React.Dispatch<React.SetStateAction<HaulzWorkbook | null>>>(() => undefined);
  const setActiveTabRef = useRef<React.Dispatch<React.SetStateAction<string>>>(() => undefined);
  const setWorkbookTableCollapsedRef = useRef<React.Dispatch<React.SetStateAction<boolean>>>(() => undefined);
  const setTdPanelOpenRef = useRef<React.Dispatch<React.SetStateAction<boolean>>>(() => undefined);
  const ensureUlSheetLoadedRef = useRef<
    (
      tabId: string,
      currentWorkbook: HaulzWorkbook,
      currentJobId: string,
      files: HaulzReturnsFileMeta[],
    ) => Promise<((latestWorkbook: HaulzWorkbook) => HaulzWorkbook) | null>
  >(async () => null);
  const hydrateAllUlSheetsRef = useRef<
    (currentWorkbook: HaulzWorkbook, currentJobId: string) => Promise<HaulzWorkbook>
  >(async (wb) => wb);
  const hydrateDeferredItogSheetRef = useRef<
    (currentWorkbook: HaulzWorkbook, currentJobId: string) => Promise<HaulzWorkbook>
  >(async (wb) => wb);

  const upload = useHaulzUpload({
    auth,
    jobId: sessionRef.current?.jobId ?? null,
    setJobId: (value) => sessionRef.current?.setJobId(value),
    setStoredFiles: (value) => sessionRef.current?.setStoredFiles(value),
    setWorkbook: (value) => setWorkbookRef.current(value),
    setActiveTab: (value) => setActiveTabRef.current(value),
    setWorkbookTableCollapsed: (value) => setWorkbookTableCollapsedRef.current(value),
    setError,
    refreshJobs: async () => {
      await sessionRef.current?.refreshJobs();
    },
    hydrateDeferredItogSheet: (wb, id) => hydrateDeferredItogSheetRef.current(wb, id),
  });

  const workbookHook = useHaulzWorkbook({
    auth,
    jobId: sessionRef.current?.jobId ?? null,
    jobs: sessionRef.current?.jobs ?? [],
    storedFiles: sessionRef.current?.storedFiles ?? [],
    processing: upload.processing,
    otpravkaFile: upload.otpravkaFile,
    ulPrio1: upload.ulPrio1,
    ulPrio2: upload.ulPrio2,
    setError,
    setProcessing: upload.setProcessing,
    previewing: upload.previewing,
    setPreviewing: upload.setPreviewing,
    buildLocalWorkbookPreview: upload.buildLocalWorkbookPreview,
    ensureUlSheetLoaded: (...args) => ensureUlSheetLoadedRef.current(...args),
    hydrateAllUlSheets: (...args) => hydrateAllUlSheetsRef.current(...args),
  });

  setWorkbookRef.current = workbookHook.setWorkbook;
  setActiveTabRef.current = workbookHook.setActiveTab;
  setWorkbookTableCollapsedRef.current = workbookHook.setWorkbookTableCollapsed;
  setTdPanelOpenRef.current = workbookHook.setTdPanelOpen;

  const ulLoader = useUlSheetLoader({
    auth,
    storedFiles: sessionRef.current?.storedFiles ?? [],
    jobId: sessionRef.current?.jobId ?? null,
    workbook: workbookHook.workbook,
    setWorkbook: workbookHook.setWorkbook,
    setError,
    setActiveTab: workbookHook.setActiveTab,
  });

  ensureUlSheetLoadedRef.current = ulLoader.ensureUlSheetLoaded;
  hydrateAllUlSheetsRef.current = ulLoader.hydrateAllUlSheets;
  hydrateDeferredItogSheetRef.current = ulLoader.hydrateDeferredItogSheet;

  const session = useHaulzSession({
    auth,
    hydrateDeferredItogSheet: ulLoader.hydrateDeferredItogSheet,
    otpravkaFile: upload.otpravkaFile,
    workbook: workbookHook.workbook,
    setters: {
      setOtpravkaFile: upload.setOtpravkaFile,
      setUlPrio1: upload.setUlPrio1,
      setUlPrio2: upload.setUlPrio2,
      setWorkbook: workbookHook.setWorkbook,
      setActiveTab: workbookHook.setActiveTab,
      setWorkbookTableCollapsed: workbookHook.setWorkbookTableCollapsed,
      setTdPanelOpen: workbookHook.setTdPanelOpen,
      setError,
      setProcessing: upload.setProcessing,
    },
  });

  sessionRef.current = session;

  const { workbook, activeSheet } = workbookHook;

  if (!auth) {
    return (
      <div className="w-full hr-page">
        <Typography.Body>Нет авторизации для работы с возвратами.</Typography.Body>
      </div>
    );
  }

  return (
    <div className="w-full hr-page">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
        {onBack ? (
          <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }} aria-label="Назад">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        ) : null}
        <Typography.Headline className="text-page-title">{pageTitle}</Typography.Headline>
        {session.jobId ? (
          <Typography.Body style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
            {workbookHook.activeJobTitle ?? `Сессия ${session.jobId}`}
            {workbookHook.saving ? " · сохранение…" : " · в БД"}
          </Typography.Body>
        ) : workbook ? (
          <Typography.Body style={{ color: "var(--color-text-secondary)", fontSize: "0.85rem" }}>
            {upload.previewing ? "Сборка таблицы…" : "Предпросмотр · нажмите «Обработать и сохранить» для записи в БД"}
          </Typography.Body>
        ) : null}
      </Flex>

      <HaulzSessionList
        jobs={session.jobs}
        loadingJobs={session.loadingJobs}
        jobId={session.jobId}
        renamingJobId={session.renamingJobId}
        renameDraft={session.renameDraft}
        renaming={session.renaming}
        setRenameDraft={session.setRenameDraft}
        loadJob={session.loadJob}
        handleDeleteJob={session.handleDeleteJob}
        startRenameJob={session.startRenameJob}
        cancelRenameJob={session.cancelRenameJob}
        saveRenameJob={session.saveRenameJob}
      />

      <HaulzUploadPanel
        auth={auth}
        jobId={session.jobId}
        otpravkaFile={upload.otpravkaFile}
        ulPrio1={upload.ulPrio1}
        ulPrio2={upload.ulPrio2}
        storedFiles={session.storedFiles}
        storedFilesCollapsed={storedFilesCollapsed}
        setStoredFilesCollapsed={setStoredFilesCollapsed}
        canAddUlToSession={upload.canAddUlToSession}
        canProcess={upload.canProcess}
        processing={upload.processing}
        previewing={upload.previewing}
        uploadProgress={upload.uploadProgress}
        handleOtpravkaChange={upload.handleOtpravkaChange}
        addUlFiles={upload.addUlFiles}
        removeUl={upload.removeUl}
        handleAddUlToSession={upload.handleAddUlToSession}
        handleProcess={upload.handleProcess}
      />

      {error ? (
        <Typography.Body style={{ color: "var(--color-danger, #c0392b)", marginBottom: "0.75rem", whiteSpace: "pre-wrap" }}>
          {error}
        </Typography.Body>
      ) : null}

      {workbook && activeSheet ? (
        <>
          <HaulzWorkbookToolbar
            workbook={workbook}
            tabs={workbookHook.tabs}
            activeTab={workbookHook.activeTab}
            activeSheet={activeSheet}
            ulNumbersInItog={workbookHook.ulNumbersInItog}
            loadingUlTab={ulLoader.loadingUlTab}
            activeDataRowCount={workbookHook.activeDataRowCount}
            saving={workbookHook.saving}
            exporting={workbookHook.exporting}
            translating={workbookHook.translating}
            translateProgress={workbookHook.translateProgress}
            processing={upload.processing}
            itogPendingTranslateCount={workbookHook.itogPendingTranslateCount}
            itogStopRowCount={workbookHook.itogStopRowCount}
            newStopWord={workbookHook.newStopWord}
            newStopMatchMode={workbookHook.newStopMatchMode}
            workbookTableCollapsed={workbookHook.workbookTableCollapsed}
            setNewStopWord={workbookHook.setNewStopWord}
            setNewStopMatchMode={workbookHook.setNewStopMatchMode}
            setWorkbookTableCollapsed={workbookHook.setWorkbookTableCollapsed}
            handleTabSelect={ulLoader.handleTabSelect}
            handleExport={workbookHook.handleExport}
            handleCreateFix={workbookHook.handleCreateFix}
            handlePrepareTd={workbookHook.handlePrepareTd}
            handleTranslateItog={workbookHook.handleTranslateItog}
            handleRemoveItogStopRows={workbookHook.handleRemoveItogStopRows}
            handleRemoveKgdDuplicates={workbookHook.handleRemoveKgdDuplicates}
            handleRecalcItogFromKgd={workbookHook.handleRecalcItogFromKgd}
            handleDeleteUlSheet={workbookHook.handleDeleteUlSheet}
            handleAddStopWord={workbookHook.handleAddStopWord}
          />

          {workbookHook.workbookTableCollapsed ? (
            <button
              type="button"
              className="hr-table-collapsed"
              onClick={() => workbookHook.setWorkbookTableCollapsed(false)}
            >
              <span className="hr-table-collapsed__title">Лист «{activeSheet.name}»</span>
              <span className="hr-table-collapsed__meta">
                {ulLoader.loadingUlTab === activeSheet.id ? "Загрузка…" : `${workbookHook.activeDataRowCount} строк · нажмите, чтобы развернуть`}
              </span>
            </button>
          ) : (
            <>
              {activeSheet.id.startsWith("ul-") ? (
                <div className="hr-ul-meta-panels">
                  <HaulzUlCarrierPanel
                    auth={auth}
                    sheetId={activeSheet.id}
                    carrierId={activeSheet.carrierId}
                    onCarrierChange={(carrierId) => workbookHook.handleUlCarrierChange(activeSheet.id, carrierId)}
                    onError={setError}
                  />
                  <HaulzUlTdField
                    sheetId={activeSheet.id}
                    ulNumber={activeSheet.name || activeSheet.id.slice(3)}
                    tdNumber={activeSheet.tdNumber}
                    tdDate={activeSheet.tdDate}
                    onChange={(patch) => workbookHook.handleUlTdMetaChange(activeSheet.id, patch)}
                    disabled={workbookHook.saving}
                  />
                </div>
              ) : null}
              <HaulzReturnsWorkbookView
                sheet={activeSheet}
                canDelete={
                  activeSheet.id === "itog" ||
                  activeSheet.id === "stop" ||
                  activeSheet.id === "fix" ||
                  activeSheet.id.startsWith("ul-")
                }
                onDeleteRow={
                  activeSheet.id === "itog" || activeSheet.id === "fix"
                    ? workbookHook.handleDeleteItogRow
                    : activeSheet.id === "stop"
                      ? workbookHook.handleDeleteStopRow
                      : activeSheet.id.startsWith("ul-")
                        ? workbookHook.handleDeleteUlRow
                        : undefined
                }
                onStopMatchModeChange={
                  activeSheet.id === "stop" ? workbookHook.handleStopMatchModeChange : undefined
                }
                onBulkDelete={workbookHook.handleBulkDeleteRows}
                onBulkMarkColor={workbookHook.handleBulkMarkRows}
              />
            </>
          )}

          {session.jobId ? (
            <HaulzCustomsPanel
              auth={auth}
              jobId={session.jobId}
              workbook={workbook}
              carriers={workbookHook.carriers}
              open={workbookHook.tdPanelOpen}
              onDraftChange={workbookHook.handleTdDraftChange}
              onError={setError}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

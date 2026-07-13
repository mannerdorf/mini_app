import { ChevronDown, ChevronUp, Download, FileText, Languages, Trash2 } from "lucide-react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { isUlTabInItog, STOP_MATCH_MODE_LABELS, type HaulzWorkbook, type StopMatchMode } from "../../lib/haulzReturns";
import { YELLOW_BADGE_TAB_IDS, RED_BADGE_TAB_IDS } from "./haulzReturnsPageUtils";

type TabItem = { id: string; label: string };

type Props = {
  workbook: HaulzWorkbook;
  tabs: TabItem[];
  activeTab: string;
  activeSheet: NonNullable<HaulzWorkbook["sheets"][number]>;
  ulNumbersInItog: Set<string>;
  loadingUlTab: string | null;
  activeDataRowCount: number;
  saving: boolean;
  exporting: boolean;
  translating: boolean;
  translateProgress: { done: number; total: number } | null;
  processing: boolean;
  itogPendingTranslateCount: number;
  itogStopRowCount: number;
  newStopWord: string;
  newStopMatchMode: StopMatchMode;
  workbookTableCollapsed: boolean;
  setNewStopWord: (value: string) => void;
  setNewStopMatchMode: (value: StopMatchMode) => void;
  setWorkbookTableCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  handleTabSelect: (tabId: string) => void;
  handleExport: () => void;
  handleCreateFix: () => void;
  handlePrepareTd: () => void;
  handleTranslateItog: () => void;
  handleRemoveItogStopRows: () => void;
  handleRemoveKgdDuplicates: () => void;
  handleRecalcItogFromKgd: () => void;
  handleDeleteUlSheet: () => void;
  handleAddStopWord: () => void;
};

export function HaulzWorkbookToolbar({
  workbook,
  tabs,
  activeTab,
  activeSheet,
  ulNumbersInItog,
  loadingUlTab,
  activeDataRowCount,
  saving,
  exporting,
  translating,
  translateProgress,
  processing,
  itogPendingTranslateCount,
  itogStopRowCount,
  newStopWord,
  newStopMatchMode,
  workbookTableCollapsed,
  setNewStopWord,
  setNewStopMatchMode,
  setWorkbookTableCollapsed,
  handleTabSelect,
  handleExport,
  handleCreateFix,
  handlePrepareTd,
  handleTranslateItog,
  handleRemoveItogStopRows,
  handleRemoveKgdDuplicates,
  handleRecalcItogFromKgd,
  handleDeleteUlSheet,
  handleAddStopWord,
}: Props) {
  return (
    <>
      <div className="hr-tabs">
        {tabs.map((tab) => {
          const inItog = isUlTabInItog(tab.id, ulNumbersInItog);
          return (
            <button
              key={tab.id}
              type="button"
              className={`hr-tab-btn ${activeTab === tab.id ? "active" : ""}${inItog ? " hr-tab-btn--in-itog" : ""}${tab.id === "fix" ? " hr-tab-btn--fix" : ""}${YELLOW_BADGE_TAB_IDS.has(tab.id) ? " hr-tab-btn--badge-yellow" : ""}${RED_BADGE_TAB_IDS.has(tab.id) ? " hr-tab-btn--badge-red" : ""}`}
              onClick={() => handleTabSelect(tab.id)}
            >
              {tab.label}
              {inItog ? " ✓" : ""}
            </button>
          );
        })}
      </div>

      <Flex gap="0.5rem" wrap="wrap" style={{ margin: "0.75rem 0" }}>
        <Button type="button" className="filter-button" disabled={exporting} onClick={() => void handleExport()}>
          <Download className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          {exporting ? "Экспорт…" : "Скачать Excel"}
        </Button>
        {activeSheet.id === "itog" ? (
          <>
            <Button type="button" className="filter-button hr-btn-purple" onClick={handleCreateFix}>
              Создать FIX
            </Button>
            {workbook.sheets.some((s) => s.id === "fix") ? (
              <Button type="button" className="filter-button hr-btn-purple" disabled={saving} onClick={() => void handlePrepareTd()}>
                <FileText className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
                Подготовить ТД
              </Button>
            ) : null}
            <Button
              type="button"
              className="filter-button"
              disabled={saving || translating || itogPendingTranslateCount === 0}
              onClick={handleTranslateItog}
            >
              <Languages className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              {translating
                ? translateProgress
                  ? `Перевод ${translateProgress.done}/${translateProgress.total}…`
                  : "Перевод…"
                : itogPendingTranslateCount > 0
                  ? `Перевести (${itogPendingTranslateCount})`
                  : "Перевести"}
            </Button>
            <Button
              type="button"
              className="filter-button"
              disabled={saving || translating || processing || itogStopRowCount === 0}
              onClick={handleRemoveItogStopRows}
            >
              {itogStopRowCount > 0 ? `Удалить STOP (${itogStopRowCount})` : "Удалить STOP строки"}
            </Button>
          </>
        ) : null}
        {activeSheet.id === "kgd" ? (
          <>
            <Button type="button" className="filter-button" disabled={saving} onClick={handleRemoveKgdDuplicates}>
              Удалить дубли
            </Button>
            <Button type="button" className="filter-button" disabled={saving} onClick={handleRecalcItogFromKgd}>
              Пересчитать итог
            </Button>
          </>
        ) : null}
        {activeSheet.id.startsWith("ul-") ? (
          <Button type="button" className="filter-button" disabled={saving} onClick={handleDeleteUlSheet}>
            <Trash2 className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Удалить УЛ
          </Button>
        ) : null}
        {activeSheet.id === "stop" ? (
          <div className="hr-stop-add">
            <input
              type="text"
              className="hr-stop-add__input"
              placeholder="Наименование…"
              value={newStopWord}
              onChange={(e) => setNewStopWord(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddStopWord();
                }
              }}
            />
            <select
              className="hr-stop-match-select hr-stop-add__select"
              value={newStopMatchMode}
              onChange={(e) => setNewStopMatchMode(e.target.value as StopMatchMode)}
            >
              {(Object.entries(STOP_MATCH_MODE_LABELS) as [StopMatchMode, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button type="button" className="filter-button" disabled={saving || !newStopWord.trim()} onClick={handleAddStopWord}>
              Добавить STOP
            </Button>
          </div>
        ) : null}
        <Typography.Body style={{ color: "var(--color-text-secondary)", alignSelf: "center" }}>
          {loadingUlTab === activeSheet.id ? "Загрузка листа…" : `${activeDataRowCount} строк`}
        </Typography.Body>
        <Button type="button" className="filter-button" onClick={() => setWorkbookTableCollapsed((v) => !v)}>
          {workbookTableCollapsed ? (
            <>
              <ChevronDown className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              Показать таблицу
            </>
          ) : (
            <>
              <ChevronUp className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              Свернуть
            </>
          )}
        </Button>
      </Flex>
    </>
  );
}

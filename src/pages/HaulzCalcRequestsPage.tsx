import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import type { AuthData } from "../types";
import {
  deleteHaulzCalcDraft,
  fetchHaulzCalcDrafts,
  fetchHaulzCalcDraftsManager,
  fetchHaulzCalcSavedDrafts,
  patchHaulzCalcDraftStatus,
  type HaulzCalcDraft,
} from "../api/client/haulzCalculator";
import { HAULZ_CALC_DRAFT_STATUS_LABELS, type HaulzCalcDraftStatus } from "../../lib/haulzCalculator/draftStatus";
import { formatHaulzCalcDraftCustomer } from "../../lib/haulzCalculator/draftCustomerDisplay";
import { HaulzCalcRequestDetail } from "../features/haulzCalculator/HaulzCalcRequestDetail";
import {
  persistHaulzCalcRequestsTab,
  readStoredHaulzCalcRequestsTab,
  type HaulzCalcRequestsTab,
} from "../lib/profileViewPersist";

type Props = {
  auth: AuthData;
  onBack: () => void;
  onOpenCalculator: (draftId?: number) => void;
  managerMode?: boolean;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusBadgeClass(status: HaulzCalcDraftStatus): string {
  if (status === "awaiting_call") return "haulz-calc-requests-badge--awaiting";
  if (status === "agreed" || status === "submitted") return "haulz-calc-requests-badge--ok";
  if (status === "rejected") return "haulz-calc-requests-badge--reject";
  if (status === "new") return "haulz-calc-requests-badge--new";
  return "";
}

export function HaulzCalcRequestsPage({ auth, onBack, onOpenCalculator, managerMode }: Props) {
  const [tab, setTab] = useState<HaulzCalcRequestsTab>(() =>
    managerMode ? "requests" : readStoredHaulzCalcRequestsTab(),
  );
  const [requests, setRequests] = useState<HaulzCalcDraft[]>([]);
  const [savedDrafts, setSavedDrafts] = useState<HaulzCalcDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusLoadingId, setStatusLoadingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const list = tab === "saved" ? savedDrafts : requests;

  const selected = useMemo(
    () => (selectedId != null ? list.find((d) => d.id === selectedId) ?? null : null),
    [list, selectedId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (managerMode || tab === "requests") {
        const listResult = managerMode
          ? await fetchHaulzCalcDraftsManager(auth)
          : await fetchHaulzCalcDrafts(auth);
        setRequests(listResult);
        setSelectedId((prev) => {
          if (prev != null && listResult.some((d) => d.id === prev)) return prev;
          return null;
        });
      } else {
        const saved = await fetchHaulzCalcSavedDrafts(auth);
        setSavedDrafts(saved);
        setSelectedId(null);
      }
    } catch (e) {
      if (tab === "saved") {
        setSavedDrafts([]);
      } else {
        setRequests([]);
        setSelectedId(null);
      }
      setError(
        (e as Error)?.message ||
          (tab === "saved" ? "Не удалось загрузить черновики" : "Не удалось загрузить заявки"),
      );
    } finally {
      setLoading(false);
    }
  }, [auth, managerMode, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleTabChange = (next: HaulzCalcRequestsTab) => {
    setTab(next);
    setSelectedId(null);
    setError(null);
    persistHaulzCalcRequestsTab(next);
  };

  const handleOpenCalculator = (draftId?: number) => {
    if (tab === "saved") {
      persistHaulzCalcRequestsTab("saved");
    }
    onOpenCalculator(draftId);
  };

  const handleManagerStatus = async (id: number, status: "agreed" | "rejected") => {
    setStatusLoadingId(id);
    setError(null);
    try {
      const updated = await patchHaulzCalcDraftStatus(auth, id, status);
      setRequests((prev) => prev.map((d) => (d.id === id ? updated : d)));
    } catch (e) {
      setError((e as Error)?.message || "Не удалось обновить статус");
    } finally {
      setStatusLoadingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Удалить черновик?")) return;
    setDeletingId(id);
    setError(null);
    try {
      await deleteHaulzCalcDraft(auth, id);
      setSavedDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      setError((e as Error)?.message || "Не удалось удалить черновик");
    } finally {
      setDeletingId(null);
    }
  };

  const hintText =
    managerMode
      ? "Выберите строку в таблице, чтобы открыть полную информацию и изменить статус после звонка."
      : tab === "saved"
        ? "Незавершённые расчёты из калькулятора. Откройте черновик, чтобы продолжить, или начните новый расчёт."
        : "Оформленные заявки и расчёты после отправки КП.";

  const emptyText =
    managerMode
      ? "Нет заявок для обработки."
      : tab === "saved"
        ? "Черновиков пока нет. В калькуляторе нажмите «Черновик», чтобы сохранить незаконченный расчёт."
        : "Пока нет заявок. Оформите расчёт в калькуляторе или отправьте КП на почту.";

  return (
    <div className={`haulz-calc-page--cdek haulz-calc-requests-page${tab === "saved" ? " haulz-calc-drafts-page" : ""}`}>
      <div className="haulz-calc-requests-page__head">
        <button type="button" className="haulz-calc-header__back" onClick={onBack} aria-label="Назад">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="haulz-calc-header__title">{managerMode ? "Заявки (менеджер)" : "Заявки"}</h1>
      </div>

      {!managerMode && (
        <div className="haulz-calc-segment haulz-calc-requests-page__tabs" role="tablist" aria-label="Раздел заявок">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "requests"}
            className={`haulz-calc-segment__btn${tab === "requests" ? " haulz-calc-segment__btn--active" : ""}`}
            onClick={() => handleTabChange("requests")}
          >
            Заявки
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "saved"}
            className={`haulz-calc-segment__btn${tab === "saved" ? " haulz-calc-segment__btn--active" : ""}`}
            onClick={() => handleTabChange("saved")}
          >
            Черновики
          </button>
        </div>
      )}

      <p className="haulz-calc-requests-page__hint">{hintText}</p>

      {!managerMode && (
        <button
          type="button"
          className="haulz-calc-btn-primary haulz-calc-requests-page__new"
          onClick={() => handleOpenCalculator()}
        >
          Новый расчёт
        </button>
      )}

      {error && <div className="haulz-calc-alert haulz-calc-alert--error">{error}</div>}

      {loading && (
        <p className="haulz-calc-requests-page__empty">
          <Loader2 className="w-4 h-4 animate-spin" style={{ display: "inline", marginRight: "0.35rem" }} />
          Загрузка…
        </p>
      )}

      {!loading && list.length === 0 && !error && (
        <p className="haulz-calc-requests-page__empty">{emptyText}</p>
      )}

      {!loading && tab === "saved" && list.length > 0 && (
        <div className="haulz-calc-requests-table-wrap haulz-calc-drafts-table-wrap">
          <table className="haulz-calc-requests-table">
            <thead>
              <tr>
                <th scope="col">Сохранено</th>
                <th scope="col">Маршрут</th>
                <th scope="col" className="haulz-calc-requests-table__num">
                  Сумма
                </th>
                <th scope="col" className="haulz-calc-requests-table__actions" aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {savedDrafts.map((d) => (
                <tr key={d.id}>
                  <td className="haulz-calc-requests-table__date">{formatWhen(d.updatedAt)}</td>
                  <td className="haulz-calc-requests-table__route">
                    <button type="button" className="haulz-calc-drafts-open" onClick={() => handleOpenCalculator(d.id)}>
                      <span className="haulz-calc-requests-table__route-title">{d.title || `#${d.id}`}</span>
                      <ChevronRight className="w-4 h-4 haulz-calc-drafts-open__chevron" aria-hidden />
                    </button>
                  </td>
                  <td className="haulz-calc-requests-table__num">
                    {d.quoteResult ? `${d.quoteResult.totalRub.toLocaleString("ru-RU")} ₽` : "—"}
                  </td>
                  <td className="haulz-calc-requests-table__actions">
                    <button
                      type="button"
                      className="haulz-calc-text-btn haulz-calc-drafts-delete"
                      disabled={deletingId === d.id}
                      aria-label="Удалить черновик"
                      onClick={() => void handleDelete(d.id)}
                    >
                      {deletingId === d.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === "requests" && list.length > 0 && (
        <div className={`haulz-calc-requests-layout${selected ? " haulz-calc-requests-layout--open" : ""}`}>
          <div className="haulz-calc-requests-table-wrap">
            <table className="haulz-calc-requests-table">
              <thead>
                <tr>
                  <th scope="col">Дата</th>
                  {managerMode && <th scope="col">Заказчик</th>}
                  <th scope="col">Маршрут</th>
                  <th scope="col">Статус</th>
                  <th scope="col" className="haulz-calc-requests-table__num">
                    Сумма
                  </th>
                  <th scope="col" className="haulz-calc-requests-table__chevron" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {requests.map((d) => {
                  const isSelected = selectedId === d.id;
                  return (
                    <tr
                      key={d.id}
                      className={isSelected ? "haulz-calc-requests-table__row--selected" : undefined}
                      tabIndex={0}
                      onClick={() => setSelectedId(d.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(d.id);
                        }
                      }}
                    >
                      <td className="haulz-calc-requests-table__date">{formatWhen(d.updatedAt)}</td>
                      {managerMode && (
                        <td className="haulz-calc-requests-table__login">
                          {formatHaulzCalcDraftCustomer(d.formState, d.loginKey)}
                        </td>
                      )}
                      <td className="haulz-calc-requests-table__route">
                        <span className="haulz-calc-requests-table__route-title">{d.title || `#${d.id}`}</span>
                        {d.nomerZayavki && (
                          <span className="haulz-calc-requests-table__route-nomer">{d.nomerZayavki}</span>
                        )}
                      </td>
                      <td>
                        <span className={`haulz-calc-requests-badge ${statusBadgeClass(d.status)}`}>
                          {HAULZ_CALC_DRAFT_STATUS_LABELS[d.status] ?? d.status}
                        </span>
                      </td>
                      <td className="haulz-calc-requests-table__num">
                        {d.quoteResult ? `${d.quoteResult.totalRub.toLocaleString("ru-RU")} ₽` : "—"}
                      </td>
                      <td className="haulz-calc-requests-table__chevron">
                        <ChevronRight className="w-4 h-4" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <aside className="haulz-calc-requests-panel" aria-label="Детали заявки">
            {selected ? (
              <HaulzCalcRequestDetail
                draft={selected}
                managerMode={managerMode}
                statusLoading={statusLoadingId === selected.id}
                onClose={() => setSelectedId(null)}
                onAgreed={() => void handleManagerStatus(selected.id, "agreed")}
                onRejected={() => void handleManagerStatus(selected.id, "rejected")}
                onContinue={() => handleOpenCalculator(selected.id)}
              />
            ) : (
              <div className="haulz-calc-requests-panel__placeholder">
                <p>Выберите заявку в таблице слева, чтобы увидеть полную информацию.</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

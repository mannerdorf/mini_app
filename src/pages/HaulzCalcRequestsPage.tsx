import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Loader2 } from "lucide-react";
import type { AuthData } from "../types";
import {
  deleteHaulzCalcDraft,
  fetchHaulzCalcDrafts,
  fetchHaulzCalcDraftsManager,
  patchHaulzCalcDraftStatus,
  type HaulzCalcDraft,
} from "../api/client/haulzCalculator";
import { HAULZ_CALC_DRAFT_STATUS_LABELS, type HaulzCalcDraftStatus } from "../../lib/haulzCalculator/draftStatus";
import { HaulzCalcRequestDetail } from "../features/haulzCalculator/HaulzCalcRequestDetail";

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
  const [drafts, setDrafts] = useState<HaulzCalcDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [statusLoadingId, setStatusLoadingId] = useState<number | null>(null);

  const selected = useMemo(
    () => (selectedId != null ? drafts.find((d) => d.id === selectedId) ?? null : null),
    [drafts, selectedId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = managerMode ? await fetchHaulzCalcDraftsManager(auth) : await fetchHaulzCalcDrafts(auth);
      setDrafts(list);
      setSelectedId((prev) => {
        if (prev != null && list.some((d) => d.id === prev)) return prev;
        return null;
      });
    } catch (e) {
      setDrafts([]);
      setSelectedId(null);
      setError((e as Error)?.message || "Не удалось загрузить заявки");
    } finally {
      setLoading(false);
    }
  }, [auth, managerMode]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: number) => {
    if (!window.confirm("Удалить сохранённую заявку?")) return;
    setDeletingId(id);
    try {
      await deleteHaulzCalcDraft(auth, id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (e) {
      setError((e as Error)?.message || "Ошибка удаления");
    } finally {
      setDeletingId(null);
    }
  };

  const handleManagerStatus = async (id: number, status: "agreed" | "rejected") => {
    setStatusLoadingId(id);
    setError(null);
    try {
      const updated = await patchHaulzCalcDraftStatus(auth, id, status);
      setDrafts((prev) => prev.map((d) => (d.id === id ? updated : d)));
    } catch (e) {
      setError((e as Error)?.message || "Не удалось обновить статус");
    } finally {
      setStatusLoadingId(null);
    }
  };

  return (
    <div className="haulz-calc-page--cdek haulz-calc-requests-page">
      <div className="haulz-calc-requests-page__head">
        <button type="button" className="haulz-calc-header__back" onClick={onBack} aria-label="Назад">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="haulz-calc-header__title">{managerMode ? "Заявки (менеджер)" : "Заявки"}</h1>
      </div>

      <p className="haulz-calc-requests-page__hint">
        {managerMode
          ? "Выберите строку в таблице, чтобы открыть полную информацию и изменить статус после звонка."
          : "Выберите заявку в таблице, чтобы посмотреть детали и продолжить расчёт."}
      </p>

      {!managerMode && (
        <button type="button" className="haulz-calc-btn-primary haulz-calc-requests-page__new" onClick={() => onOpenCalculator()}>
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

      {!loading && drafts.length === 0 && !error && (
        <p className="haulz-calc-requests-page__empty">
          {managerMode
            ? "Нет заявок для обработки."
            : "Пока нет сохранённых заявок. В калькуляторе оформите заявку или отправьте КП на почту."}
        </p>
      )}

      {!loading && drafts.length > 0 && (
        <div className={`haulz-calc-requests-layout${selected ? " haulz-calc-requests-layout--open" : ""}`}>
          <div className="haulz-calc-requests-table-wrap">
            <table className="haulz-calc-requests-table">
              <thead>
                <tr>
                  <th scope="col">Дата</th>
                  {managerMode && <th scope="col">Клиент</th>}
                  <th scope="col">Маршрут</th>
                  <th scope="col">Статус</th>
                  <th scope="col" className="haulz-calc-requests-table__num">
                    Сумма
                  </th>
                  <th scope="col" className="haulz-calc-requests-table__chevron" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => {
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
                        <td className="haulz-calc-requests-table__login">{d.loginKey ?? "—"}</td>
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
                deleting={deletingId === selected.id}
                onClose={() => setSelectedId(null)}
                onAgreed={() => void handleManagerStatus(selected.id, "agreed")}
                onRejected={() => void handleManagerStatus(selected.id, "rejected")}
                onContinue={() => onOpenCalculator(selected.id)}
                onDelete={() => void handleDelete(selected.id)}
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

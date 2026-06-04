import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import type { AuthData } from "../types";
import {
  deleteHaulzCalcDraft,
  fetchHaulzCalcDrafts,
  fetchHaulzCalcDraftsManager,
  patchHaulzCalcDraftStatus,
  type HaulzCalcDraft,
} from "../api/client/haulzCalculator";
import { HAULZ_CALC_DRAFT_STATUS_LABELS, type HaulzCalcDraftStatus } from "../../lib/haulzCalculator/draftStatus";

type Props = {
  auth: AuthData;
  onBack: () => void;
  onOpenCalculator: (draftId?: number) => void;
  /** Супервизор HAULZ: видит все заявки и меняет статус после звонка */
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
  if (status === "awaiting_call") return "haulz-calc-requests-card__badge--awaiting";
  if (status === "agreed" || status === "submitted") return "haulz-calc-requests-card__badge--ok";
  if (status === "rejected") return "haulz-calc-requests-card__badge--reject";
  if (status === "new") return "haulz-calc-requests-card__badge--new";
  return "";
}

export function HaulzCalcRequestsPage({ auth, onBack, onOpenCalculator, managerMode }: Props) {
  const [drafts, setDrafts] = useState<HaulzCalcDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [statusLoadingId, setStatusLoadingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = managerMode ? await fetchHaulzCalcDraftsManager(auth) : await fetchHaulzCalcDrafts(auth);
      setDrafts(list);
    } catch (e) {
      setDrafts([]);
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
    <div className="w-full haulz-calc-requests-page">
      <div className="haulz-calc-requests-page__head">
        <button type="button" className="haulz-calc-header__back" onClick={onBack} aria-label="Назад">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="haulz-calc-header__title">{managerMode ? "Заявки (менеджер)" : "Заявки"}</h1>
      </div>

      <p className="haulz-calc-requests-page__hint">
        {managerMode
          ? "Заявки клиентов после отправки КП. После звонка переведите статус в «Согласовано» или «Не согласовано»."
          : "Сохранённые расчёты калькулятора. После согласования перевозки из письма статус обновится автоматически."}
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
          {managerMode ? "Нет заявок для обработки." : "Пока нет сохранённых заявок. В калькуляторе нажмите «Сохранить черновик» или отправьте КП на почту."}
        </p>
      )}

      <ul className="haulz-calc-requests-list">
        {drafts.map((d) => (
          <li key={d.id} className="haulz-calc-requests-card">
            <div className="haulz-calc-requests-card__main">
              <p className="haulz-calc-requests-card__title">{d.title || `Заявка #${d.id}`}</p>
              {managerMode && d.loginKey && (
                <p className="haulz-calc-requests-card__login">{d.loginKey}</p>
              )}
              <p className="haulz-calc-requests-card__meta">
                <span className={`haulz-calc-requests-card__badge ${statusBadgeClass(d.status)}`}>
                  {HAULZ_CALC_DRAFT_STATUS_LABELS[d.status] ?? d.status}
                </span>
                {d.nomerZayavki && <span className="haulz-calc-requests-card__badge">{d.nomerZayavki}</span>}
                {d.quoteResult && (
                  <span className="haulz-calc-requests-card__sum">
                    {d.quoteResult.totalRub.toLocaleString("ru-RU")} ₽
                  </span>
                )}
              </p>
              {d.recipientEmail && (
                <p className="haulz-calc-requests-card__date">КП: {d.recipientEmail}</p>
              )}
              <p className="haulz-calc-requests-card__date">Обновлено: {formatWhen(d.updatedAt)}</p>
            </div>
            <div className="haulz-calc-requests-card__actions">
              {managerMode && d.status === "awaiting_call" && (
                <>
                  <button
                    type="button"
                    className="haulz-calc-btn-primary"
                    disabled={statusLoadingId === d.id}
                    onClick={() => void handleManagerStatus(d.id, "agreed")}
                  >
                    {statusLoadingId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Согласовано
                  </button>
                  <button
                    type="button"
                    className="haulz-calc-btn-secondary"
                    disabled={statusLoadingId === d.id}
                    onClick={() => void handleManagerStatus(d.id, "rejected")}
                  >
                    Не согласовано
                  </button>
                </>
              )}
              {!managerMode && (
                <button type="button" className="haulz-calc-btn-primary" onClick={() => onOpenCalculator(d.id)}>
                  Продолжить
                </button>
              )}
              {!managerMode && d.status === "draft" && (
                <button
                  type="button"
                  className="haulz-calc-btn-secondary haulz-calc-requests-card__delete"
                  disabled={deletingId === d.id}
                  onClick={() => void handleDelete(d.id)}
                  aria-label="Удалить"
                >
                  {deletingId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

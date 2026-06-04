import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import type { AuthData } from "../types";
import {
  deleteHaulzCalcDraft,
  fetchHaulzCalcDrafts,
  type HaulzCalcDraft,
} from "../api/client/haulzCalculator";

type Props = {
  auth: AuthData;
  onBack: () => void;
  onOpenCalculator: (draftId?: number) => void;
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

export function HaulzCalcRequestsPage({ auth, onBack, onOpenCalculator }: Props) {
  const [drafts, setDrafts] = useState<HaulzCalcDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchHaulzCalcDrafts(auth);
      setDrafts(list);
    } catch (e) {
      setDrafts([]);
      setError((e as Error)?.message || "Не удалось загрузить заявки");
    } finally {
      setLoading(false);
    }
  }, [auth]);

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

  return (
    <div className="w-full haulz-calc-requests-page">
      <div className="haulz-calc-requests-page__head">
        <button type="button" className="haulz-calc-header__back" onClick={onBack} aria-label="Назад">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="haulz-calc-header__title">Заявки</h1>
      </div>

      <p className="haulz-calc-requests-page__hint">
        Сохранённые расчёты калькулятора. Откройте черновик, чтобы продолжить оформление.
      </p>

      <button type="button" className="haulz-calc-btn-primary haulz-calc-requests-page__new" onClick={() => onOpenCalculator()}>
        Новый расчёт
      </button>

      {error && <div className="haulz-calc-alert haulz-calc-alert--error">{error}</div>}

      {loading && (
        <p className="haulz-calc-requests-page__empty">
          <Loader2 className="w-4 h-4 animate-spin" style={{ display: "inline", marginRight: "0.35rem" }} />
          Загрузка…
        </p>
      )}

      {!loading && drafts.length === 0 && !error && (
        <p className="haulz-calc-requests-page__empty">Пока нет сохранённых заявок. В калькуляторе нажмите «Сохранить черновик».</p>
      )}

      <ul className="haulz-calc-requests-list">
        {drafts.map((d) => (
          <li key={d.id} className="haulz-calc-requests-card">
            <div className="haulz-calc-requests-card__main">
              <p className="haulz-calc-requests-card__title">{d.title || `Заявка #${d.id}`}</p>
              <p className="haulz-calc-requests-card__meta">
                {d.status === "submitted" ? (
                  <span className="haulz-calc-requests-card__badge haulz-calc-requests-card__badge--ok">
                    Оформлена{d.nomerZayavki ? `: ${d.nomerZayavki}` : ""}
                  </span>
                ) : (
                  <span className="haulz-calc-requests-card__badge">Черновик</span>
                )}
                {d.quoteResult && (
                  <span className="haulz-calc-requests-card__sum">
                    {d.quoteResult.totalRub.toLocaleString("ru-RU")} ₽
                  </span>
                )}
              </p>
              <p className="haulz-calc-requests-card__date">Обновлено: {formatWhen(d.updatedAt)}</p>
            </div>
            <div className="haulz-calc-requests-card__actions">
              <button type="button" className="haulz-calc-btn-primary" onClick={() => onOpenCalculator(d.id)}>
                Продолжить
              </button>
              <button
                type="button"
                className="haulz-calc-btn-secondary haulz-calc-requests-card__delete"
                disabled={deletingId === d.id}
                onClick={() => void handleDelete(d.id)}
                aria-label="Удалить"
              >
                {deletingId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

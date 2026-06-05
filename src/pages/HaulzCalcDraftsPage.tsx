import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import type { AuthData } from "../types";
import {
  deleteHaulzCalcDraft,
  fetchHaulzCalcSavedDrafts,
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

export function HaulzCalcDraftsPage({ auth, onBack, onOpenCalculator }: Props) {
  const [drafts, setDrafts] = useState<HaulzCalcDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDrafts(await fetchHaulzCalcSavedDrafts(auth));
    } catch (e) {
      setDrafts([]);
      setError((e as Error)?.message || "Не удалось загрузить черновики");
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: number) => {
    if (!window.confirm("Удалить черновик?")) return;
    setDeletingId(id);
    setError(null);
    try {
      await deleteHaulzCalcDraft(auth, id);
      setDrafts((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      setError((e as Error)?.message || "Не удалось удалить черновик");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="haulz-calc-page--cdek haulz-calc-requests-page haulz-calc-drafts-page">
      <div className="haulz-calc-requests-page__head">
        <button type="button" className="haulz-calc-header__back" onClick={onBack} aria-label="Назад">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="haulz-calc-header__title">Черновики</h1>
      </div>

      <p className="haulz-calc-requests-page__hint">
        Незавершённые расчёты из калькулятора. Откройте черновик, чтобы продолжить, или начните новый расчёт.
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
        <p className="haulz-calc-requests-page__empty">
          Черновиков пока нет. В калькуляторе нажмите «Черновик», чтобы сохранить незаконченный расчёт.
        </p>
      )}

      {!loading && drafts.length > 0 && (
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
              {drafts.map((d) => (
                <tr key={d.id}>
                  <td className="haulz-calc-requests-table__date">{formatWhen(d.updatedAt)}</td>
                  <td className="haulz-calc-requests-table__route">
                    <button type="button" className="haulz-calc-drafts-open" onClick={() => onOpenCalculator(d.id)}>
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
    </div>
  );
}

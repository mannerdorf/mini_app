import React from "react";
import {
  pickupJobCanEdit,
  type Job,
  type Route,
} from "../../../lib/pickup/model";
import type { Attention } from "./operations";
export function PickupAttention({
  items,
  onJob,
  onRoute,
  onRepeat,
  renderResolution,
}: {
  items: Attention[];
  onJob: (job: Job) => void;
  onRoute: (route: Route) => void;
  onRepeat: (job: Job) => void;
  renderResolution: (job: Job) => React.ReactNode;
}) {
  return (
    <section className="pk-panel">
      <h2>Требуют внимания · {items.length}</h2>
      <p className="pk-hint">
        Проблемы, окна забора и подтверждения маршрутов. Время в пути не
        рассчитывается.
      </p>
      {!items.length && (
        <p className="pk-notice">Сейчас нет событий, требующих внимания.</p>
      )}
      {items.map((item) => (
        <article
          key={item.id}
          className={`pk-attention pk-attention--${item.tone}`}
        >
          <h3>{item.title}</h3>
          <p>{item.detail}</p>
          {item.job && (
            <>
              <strong>{item.job.data.senderName}</strong>
              <p>{item.job.data.address}</p>
              <div className="pk-actions">
                {item.job.data.contacts
                  .filter((c) => c.phone)
                  .map((c, i) => (
                    <a
                      className="pk-action-link"
                      key={i}
                      href={`tel:${c.phone.replace(/[^+\d]/g, "")}`}
                    >
                      Позвонить: {c.name || c.phone}
                      {c.extension ? ` · доб. ${c.extension}` : ""}
                    </a>
                  ))}
                <button onClick={() => onJob(item.job!)}>
                  {pickupJobCanEdit(item.job.status)
                    ? "Изменить дату / данные"
                    : "Открыть маршрут"}
                </button>
              </div>
              {item.kind === "problem" && (
                <>
                  <button onClick={() => onRepeat(item.job!)}>
                    Создать повторный забор
                  </button>
                  <p className="pk-hint">
                    Проверьте новую дату и количество оставшихся мест. Решение
                    по текущей точке фиксируется отдельно.
                  </p>
                  {renderResolution(item.job)}
                </>
              )}
            </>
          )}
          {item.route && (
            <div className="pk-actions">
              <button onClick={() => onRoute(item.route!)}>
                Открыть маршрут
              </button>
              {item.route.snapshot.driver?.data.phone && (
                <a
                  className="pk-action-link"
                  href={`tel:${item.route.snapshot.driver.data.phone.replace(/[^+\d]/g, "")}`}
                >
                  Позвонить водителю
                </a>
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

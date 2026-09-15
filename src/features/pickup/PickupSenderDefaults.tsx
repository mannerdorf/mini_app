import React, { useEffect, useState } from "react";
import type { City, JobData } from "../../../lib/pickup/model";
import type { PickupCall } from "./client";
export function PickupSenderDefaults({
  senderInn,
  city,
  call,
  onApply,
}: {
  senderInn: string;
  city: City;
  call: PickupCall;
  onApply: (patch: Partial<JobData>) => void;
}) {
  const [items, setItems] = useState<Partial<JobData>[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    if (!senderInn) return;
    setLoading(true);
    setItems([]);
    setError("");
    call<{ items: Partial<JobData>[] }>({
      action: "sender_defaults",
      senderInn,
      city,
    })
      .then((r) => {
        if (active) setItems(r.items);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [senderInn, city, call]);
  if (!senderInn) return null;
  return (
    <details className="pk-sender-defaults">
      <summary>
        Ранее использованные адреса отправителя{" "}
        {items.length ? `· ${items.length}` : ""}
      </summary>
      <p className="pk-hint">
        Можно подставить адрес, контакты, часы склада и инструкции из
        предыдущего забора. Проверьте их актуальность.
      </p>
      {loading && <p role="status">Загрузка адресов…</p>}
      {error && <p className="pk-warning">{error}</p>}
      {!loading && !error && !items.length && (
        <p className="pk-hint">
          У этого отправителя пока нет сохранённых заборов в выбранном городе.
        </p>
      )}
      {items.map((item, i) => (
        <article className="pk-card" key={i}>
          <strong>{item.address}</strong>
          <p>
            {item.windowFrom}–{item.windowTo} ·{" "}
            {item.contacts
              ?.map((c) =>
                [c.name, c.phone, c.extension ? `доб. ${c.extension}` : ""]
                  .filter(Boolean)
                  .join(" · "),
              )
              .join("; ")}
          </p>
          <button type="button" onClick={() => onApply(item)}>
            Подставить адрес и контакты
          </button>
        </article>
      ))}
    </details>
  );
}

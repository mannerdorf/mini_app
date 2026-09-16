import React, { useMemo, useState } from "react";
import type { Job, Route } from "../../../lib/pickup/model";
import { cities, plannedPlaces } from "../../../lib/pickup/model";
import {
  pickupBillingStatusLabel,
  pickupJobOnBillingTab,
} from "../../../lib/pickup/pickupBillingJobs";
import { matchesDaySearch } from "./dayPlan";
import { Field } from "./Forms";
import { PickupJobStatusBadge } from "./PickupJobStatusBadge";

type Props = {
  city: keyof typeof cities;
  date: string;
  jobs: Job[];
  routes: Route[];
};

export function PickupBillingTab({ city, date, jobs, routes }: Props) {
  const [search, setSearch] = useState("");
  const rows = useMemo(() => {
    const base = jobs.filter(pickupJobOnBillingTab);
    const filtered = search.trim()
      ? base.filter((j) => matchesDaySearch(j, search, routes))
      : base;
    return filtered.sort((a, b) => {
      const bySender = a.data.senderName.localeCompare(
        b.data.senderName,
        "ru",
      );
      if (bySender !== 0) return bySender;
      return a.data.windowFrom.localeCompare(b.data.windowFrom);
    });
  }, [jobs, routes, search]);

  const dateLabel = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(new Date(date + "T12:00:00"));

  return (
    <section className="pk-panel pk-billing">
      <h2>
        Выставление счетов · {dateLabel} · {cities[city]}
      </h2>
      <p className="pk-hint">
        Заборы со статусом «Сдан на склад» и указанным номером перевозки. День
        и город — как в шапке диспетчеризации.
      </p>
      <Field
        label="Поиск"
        value={search}
        onChange={setSearch}
        placeholder="Отправитель, заказчик, № перевозки, № заявки"
      />
      <p className="pk-hint" role="status">
        Найдено: {rows.length}
      </p>
      {rows.length === 0 ? (
        <p className="pk-empty">
          Нет заборов на складе с номером перевозки за выбранный день.
        </p>
      ) : (
        <div className="pk-billing-table-wrap">
          <table className="pk-billing-table">
            <thead>
              <tr>
                <th scope="col">Окно</th>
                <th scope="col">Отправитель</th>
                <th scope="col">Заказчик</th>
                <th scope="col">№ перевозки</th>
                <th scope="col">№ заявки</th>
                <th scope="col">Груз</th>
                <th scope="col">Сумма, ₽</th>
                <th scope="col">Счёт</th>
                <th scope="col">Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((job) => (
                <tr key={job.id}>
                  <td>
                    {job.data.windowFrom}–{job.data.windowTo}
                  </td>
                  <td>{job.data.senderName}</td>
                  <td>{job.data.customerName}</td>
                  <td>
                    <strong>{job.data.cargoNumber.trim()}</strong>
                  </td>
                  <td>{job.data.zayavkaNumber || "—"}</td>
                  <td>
                    {plannedPlaces(job.data)} мест ·{" "}
                    {job.data.weightKg ?? "—"} кг
                  </td>
                  <td>
                    {job.data.priceRub != null
                      ? job.data.priceRub.toLocaleString("ru-RU")
                      : "—"}
                  </td>
                  <td>
                    {job.data.issueCustomerBill
                      ? job.data.customerBillMode === "auto"
                        ? "Авто"
                        : job.data.customerBillMode === "manual"
                          ? "Вручную"
                          : "Да"
                      : "—"}
                  </td>
                  <td title={pickupBillingStatusLabel(job)}>
                    <PickupJobStatusBadge status={job.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

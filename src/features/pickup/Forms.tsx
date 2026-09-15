import React, { useEffect, useState } from "react";
import type {
  City,
  Resource,
  ResourceKind,
  Job,
  JobData,
  Route,
} from "../../../lib/pickup/model";
import type { PickupCall } from "./client";
import type { Account } from "../../types";
import {
  defaultPickupAddressState,
  jobDataToPickupAddressState,
  pickupAddressStateToJobPatch,
} from "./pickupJobAddressState";
import { PickupJobAddressSection, pickupCityToCode } from "./PickupJobAddressSection";
import { PickupWarehouseHoursField } from "./PickupWarehouseHoursField";
import { PickupInstructionChecklistField } from "./PickupInstructionChecklistField";
import { PickupCustomerQuoteSection } from "./PickupCustomerQuoteSection";
import {
  createDefaultPickupSiteInstructions,
  formatPickupSiteInstructions,
  parsePickupSiteInstructions,
} from "../../../lib/pickup/jobSiteInstructions";

export function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  ...rest
}: {
  label: string;
  value: any;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  min?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="pk-field">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <input
        {...rest}
        type={type}
        required={required}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function Textarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="pk-field">
      <span>{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    </label>
  );
}
export function Select({
  label,
  value,
  onChange,
  options,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
  required?: boolean;
}) {
  return (
    <label className="pk-field">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        <option value="">Выберите…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Directory({
  label,
  kind,
  value,
  name,
  onChange,
  call,
}: {
  label: string;
  kind: string;
  value: string;
  name: string;
  onChange: (id: string, name: string) => void;
  call: PickupCall;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <div className="pk-directory">
      <strong>{label} *</strong>
      {value && (
        <p className="pk-selection">
          {name} · {value}
        </p>
      )}
      <div className="pk-actions">
        <input
          aria-label={`Поиск: ${label}`}
          placeholder="Название, ИНН или логин"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setError("");
            try {
              const r = await call({ action: "directory", kind, q: query });
              setItems(r.items);
              if (!r.items.length) setError("Ничего не найдено");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        >
          Найти
        </button>
      </div>
      {!!items.length && (
        <ul>
          {items.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(i.id, i.name);
                  setItems([]);
                }}
              >
                {i.name} · {i.id}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="status">{error}</p>}
    </div>
  );
}
export function FormShell({
  title,
  children,
  onClose,
  onSave,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="pk-panel pk-editor">
      <h2>{title}</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await onSave();
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>{children}</fieldset>
        {error && (
          <p className="pk-error" role="alert">
            {error}
          </p>
        )}
        <div className="pk-actions">
          <button className="pk-primary" disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
          <button type="button" onClick={onClose} disabled={busy}>
            Отмена
          </button>
        </div>
      </form>
    </section>
  );
}
export function ResourceForm({
  kind,
  resource,
  city,
  call,
  done,
}: {
  kind: ResourceKind;
  resource?: Resource;
  city: City;
  call: PickupCall;
  done: () => void;
}) {
  const [name, setName] = useState(resource?.name ?? ""),
    [active, setActive] = useState(resource?.active ?? true);
  const [data, setData] = useState<Record<string, string>>(
    resource?.data ?? { from: "08:00", to: "18:00", type: "own", lift: "Нет" },
  );
  const update = (key: string, v: string) =>
    setData((prev) => ({ ...prev, [key]: v }));
  const title = {
    driver: "Водитель",
    vehicle: "Автомобиль",
    depot: "Склад Холз",
  }[kind];
  return (
    <FormShell
      title={resource ? `Изменить: ${title}` : `Добавить: ${title}`}
      onClose={done}
      onSave={async () => {
        await call({
          action: "save_resource",
          requestId: crypto.randomUUID(),
          id: resource?.id,
          version: resource?.version,
          kind,
          city,
          name,
          active,
          data,
        });
      }}
    >
      <div className="pk-grid">
        <Field
          label={kind === "driver" ? "ФИО" : "Название"}
          value={name}
          onChange={setName}
          required
        />
        {kind !== "depot" && (
          <Select
            label="Принадлежность"
            value={data.type ?? "own"}
            onChange={(v) => update("type", v)}
            options={[
              { id: "own", name: "Собственный" },
              { id: "hired", name: "Наёмный" },
            ]}
          />
        )}
        <Field
          label="Начало работы"
          type="time"
          value={data.from}
          onChange={(v) => update("from", v)}
          required
        />
        <Field
          label="Окончание работы"
          type="time"
          value={data.to}
          onChange={(v) => update("to", v)}
          required
        />
      </div>
      {kind === "driver" && (
        <>
          <Directory
            label="Аккаунт с бейджем «Водитель»"
            kind="user"
            value={data.login ?? ""}
            name={data.login ?? ""}
            onChange={(id) => update("login", id)}
            call={call}
          />
          <div className="pk-grid">
            <Field
              label="Основной телефон"
              type="tel"
              value={data.phone}
              onChange={(v) => update("phone", v)}
              required
            />
            <Field
              label="Дополнительный телефон"
              type="tel"
              value={data.phoneExtra}
              onChange={(v) => update("phoneExtra", v)}
            />
            <Field
              label="Перевозчик"
              value={data.carrier}
              onChange={(v) => update("carrier", v)}
            />
          </div>
        </>
      )}
      {kind === "vehicle" && (
        <div className="pk-grid">
          {[
            ["plate", "Госномер"],
            ["model", "Марка / модель"],
            ["bodyType", "Тип кузова"],
            ["dimensions", "Внутренние размеры кузова, см"],
            ["loading", "Тип загрузки"],
            ["permits", "Пропуска / ограничения"],
          ].map(([k, l]) => (
            <Field
              key={k}
              label={l}
              value={data[k]}
              onChange={(v) => update(k, v)}
              required={k === "plate"}
            />
          ))}
          {[
            ["capacityKg", "Грузоподъёмность, кг"],
            ["capacityM3", "Полезный объём, м³"],
            ["pallets", "Палетоместа"],
          ].map(([k, l]) => (
            <Field
              key={k}
              label={l}
              type="number"
              min="0"
              step="any"
              value={data[k]}
              onChange={(v) => update(k, v)}
            />
          ))}
          <Select
            label="Гидроборт"
            value={data.lift ?? "Нет"}
            onChange={(v) => update("lift", v)}
            options={[
              { id: "Нет", name: "Нет" },
              { id: "Да", name: "Да" },
            ]}
          />
        </div>
      )}
      {kind === "depot" && (
        <>
          <Field
            label="Адрес конечной точки"
            value={data.address}
            onChange={(v) => update("address", v)}
            required
          />
          <Field
            label="Телефон склада"
            value={data.phone}
            onChange={(v) => update("phone", v)}
          />
          <Field
            label="Ссылка на проезд"
            type="url"
            value={data.directionsUrl}
            onChange={(v) => update("directionsUrl", v)}
          />
        </>
      )}
      <Textarea
        label="Примечания / ограничения / доступность"
        value={data.note ?? ""}
        onChange={(v) => update("note", v)}
      />
      <label className="pk-check">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Доступен для назначения
      </label>
    </FormShell>
  );
}
const emptyData: JobData = {
  customerInn: "",
  customerName: "",
  senderInn: "",
  senderName: "",
  address: "",
  instructions: "",
  directionsUrl: "",
  contacts: [{ name: "", phone: "", extension: "", purpose: "Звонки" }],
  documents: [],
  places: [
    { kind: "", count: 1, lengthCm: null, widthCm: null, heightCm: null },
  ],
  weightKg: null,
  volumeM3: null,
  windowFrom: "10:00",
  windowTo: "17:00",
  warehouseHours: "",
  serviceMinutes: 20,
  zayavkaNumber: "",
  cargoNumber: "",
  priceRub: null,
  payment: "Не указано",
  mkadKm: null,
  requirements: "",
  note: "",
  latitude: null,
  longitude: null,
};
export function JobForm({
  job,
  city,
  date,
  call,
  account,
  done,
}: {
  job?: Job;
  city: City;
  date: string;
  call: PickupCall;
  account: Account;
  done: () => void;
}) {
  const cityCode = pickupCityToCode(city);
  const [data, setData] = useState<JobData>(job?.data ?? emptyData);
  const [day, setDay] = useState(job?.date ?? date);
  const [addressState, setAddressState] = useState(() =>
    job?.data
      ? jobDataToPickupAddressState(job.data, cityCode)
      : defaultPickupAddressState(cityCode),
  );
  const [siteInstructions, setSiteInstructions] = useState(() =>
    job?.data?.instructions
      ? parsePickupSiteInstructions(job.data.instructions)
      : createDefaultPickupSiteInstructions(),
  );
  const update = (key: keyof JobData, v: any) =>
    setData((prev) => ({ ...prev, [key]: v }));
  const patchJob = (patch: Partial<JobData>) =>
    setData((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    setAddressState((prev) =>
      prev.city === cityCode ? prev : { ...prev, city: cityCode },
    );
  }, [cityCode]);

  useEffect(() => {
    const fields = pickupAddressStateToJobPatch(addressState);
    setData((prev) => {
      const contacts = [...prev.contacts];
      if (fields.contactPhone || fields.contactName) {
        contacts[0] = {
          ...contacts[0],
          phone: fields.contactPhone ?? contacts[0].phone,
          name: fields.contactName ?? contacts[0].name,
        };
      }
      if (
        prev.address === fields.address &&
        prev.latitude === fields.latitude &&
        prev.longitude === fields.longitude &&
        contacts[0].phone === prev.contacts[0].phone &&
        contacts[0].name === prev.contacts[0].name
      ) {
        return prev;
      }
      return {
        ...prev,
        address: fields.address,
        latitude: fields.latitude,
        longitude: fields.longitude,
        contacts,
      };
    });
  }, [addressState]);

  useEffect(() => {
    const instructions = formatPickupSiteInstructions(siteInstructions);
    setData((prev) =>
      prev.instructions === instructions ? prev : { ...prev, instructions },
    );
  }, [siteInstructions]);

  const num = (v: string) => (v === "" ? null : Number(v));
  const totalVolume = data.places.every(
    (p) => p.lengthCm && p.widthCm && p.heightCm,
  )
    ? data.places.reduce(
        (s, p) =>
          s + (p.count * p.lengthCm! * p.widthCm! * p.heightCm!) / 1000000,
        0,
      )
    : null;
  return (
    <FormShell
      title={job ? "Редактировать забор" : "Новый забор"}
      onClose={done}
      onSave={async () => {
        await call({
          action: "save_job",
          requestId: crypto.randomUUID(),
          id: job?.id,
          version: job?.version,
          city,
          date: day,
          data,
        });
      }}
    >
      <div className="pk-grid">
        <Field
          label="Дата пикапа"
          type="date"
          value={day}
          onChange={setDay}
          required
        />
        <Field
          label="Номер заявки"
          value={data.zayavkaNumber}
          onChange={(v) => update("zayavkaNumber", v)}
          placeholder="Как в 1С / документах"
        />
        <Field
          label="№ перевозки (если известен)"
          value={data.cargoNumber}
          onChange={(v) => update("cargoNumber", v)}
        />
      </div>
      <div className="pk-grid">
        <Directory
          label="Заказчик"
          kind="customer"
          value={data.customerInn}
          name={data.customerName}
          call={call}
          onChange={(id, name) =>
            setData((p) => ({ ...p, customerInn: id, customerName: name }))
          }
        />
        <Directory
          label="Отправитель"
          kind="supplier"
          value={data.senderInn}
          name={data.senderName}
          call={call}
          onChange={(id, name) =>
            setData((p) => ({ ...p, senderInn: id, senderName: name }))
          }
        />
      </div>
      <PickupJobAddressSection
        account={account}
        city={city}
        customerInn={data.customerInn}
        customerName={data.customerName}
        data={data}
        addressState={addressState}
        onAddressStateChange={setAddressState}
        onJobPatch={patchJob}
        num={num}
      />
      <PickupWarehouseHoursField
        value={data.warehouseHours}
        onChange={(v) => update("warehouseHours", v)}
      />
      <PickupInstructionChecklistField
        state={siteInstructions}
        onChange={setSiteInstructions}
      />
      <Field
        label="Ссылка на схему проезда"
        type="url"
        value={data.directionsUrl}
        onChange={(v) => update("directionsUrl", v)}
      />
      <details>
        <summary>Координаты точки на карте (необязательно)</summary>
        <div className="pk-grid">
          <Field
            label="Широта"
            type="number"
            step="any"
            value={data.latitude}
            onChange={(v) => update("latitude", num(v))}
          />
          <Field
            label="Долгота"
            type="number"
            step="any"
            value={data.longitude}
            onChange={(v) => update("longitude", num(v))}
          />
        </div>
      </details>
      <h3>Контакты</h3>
      {data.contacts.map((c, i) => (
        <div className="pk-subrow" key={i}>
          <div className="pk-grid">
            {[
              ["name", "Контактное лицо"],
              ["phone", "Телефон"],
              ["extension", "Добавочный"],
              ["purpose", "Звонки / переписка"],
            ].map(([k, l]) => (
              <Field
                key={k}
                label={l}
                value={c[k as keyof typeof c]}
                onChange={(v) =>
                  update(
                    "contacts",
                    data.contacts.map((r, n) =>
                      n === i ? { ...r, [k]: v } : r,
                    ),
                  )
                }
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              update(
                "contacts",
                data.contacts.filter((_, n) => n !== i),
              )
            }
          >
            Удалить контакт
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          update("contacts", [
            ...data.contacts,
            { name: "", phone: "", extension: "", purpose: "Звонки" },
          ])
        }
      >
        + Контакт
      </button>
      <h3>Документы для получения груза</h3>
      <p className="pk-muted">
        Счета отправителя, по которым нужно получить груз.
      </p>
      {data.documents.map((d, i) => (
        <div className="pk-subrow pk-grid" key={i}>
          <Field
            label="Номер счёта / документа"
            value={d.number}
            onChange={(v) =>
              update(
                "documents",
                data.documents.map((r, n) =>
                  n === i ? { ...r, number: v } : r,
                ),
              )
            }
          />
          <Field
            label="Дата документа"
            type="date"
            value={d.date}
            onChange={(v) =>
              update(
                "documents",
                data.documents.map((r, n) => (n === i ? { ...r, date: v } : r)),
              )
            }
          />
          <button
            type="button"
            onClick={() =>
              update(
                "documents",
                data.documents.filter((_, n) => n !== i),
              )
            }
          >
            Удалить документ
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          update("documents", [...data.documents, { number: "", date: "" }])
        }
      >
        + Документ
      </button>
      <h3>Грузовые места</h3>
      {data.places.map((p, i) => (
        <div className="pk-subrow" key={i}>
          <div className="pk-grid">
            <Field
              label="Упаковка: рулон, коробка…"
              value={p.kind}
              onChange={(v) =>
                update(
                  "places",
                  data.places.map((r, n) => (n === i ? { ...r, kind: v } : r)),
                )
              }
            />
            {[
              ["count", "Количество"],
              ["lengthCm", "Длина одного места, см"],
              ["widthCm", "Ширина, см"],
              ["heightCm", "Высота, см"],
            ].map(([k, l]) => (
              <Field
                key={k}
                label={l}
                type="number"
                min={k === "count" ? "1" : "0"}
                step={k === "count" ? "1" : "any"}
                value={p[k as keyof typeof p]}
                onChange={(v) =>
                  update(
                    "places",
                    data.places.map((r, n) =>
                      n === i ? { ...r, [k]: num(v) } : r,
                    ),
                  )
                }
                required={k === "count"}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              update(
                "places",
                data.places.filter((_, n) => n !== i),
              )
            }
          >
            Удалить группу мест
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          update("places", [
            ...data.places,
            {
              kind: "",
              count: 1,
              lengthCm: null,
              widthCm: null,
              heightCm: null,
            },
          ])
        }
      >
        + Группа мест
      </button>
      <div className="pk-grid">
        <Field
          label="Общий физический вес, кг"
          type="number"
          min="0"
          step="any"
          value={data.weightKg}
          onChange={(v) => update("weightKg", num(v))}
        />
        <Field
          label="Общий физический объём, м³"
          type="number"
          min="0"
          step="any"
          value={data.volumeM3}
          onChange={(v) => update("volumeM3", num(v))}
        />
      </div>
      {totalVolume !== null && (
        <button
          type="button"
          onClick={() => update("volumeM3", Number(totalVolume.toFixed(4)))}
        >
          Подставить объём по габаритам: {totalVolume.toFixed(3)} м³
        </button>
      )}
      <Field
        label="Требования к машине и погрузке"
        value={data.requirements}
        onChange={(v) => update("requirements", v)}
      />
      <PickupCustomerQuoteSection
        city={city}
        data={data}
        call={call}
        onPatch={patchJob}
        num={num}
      />
    </FormShell>
  );
}
export function RouteForm({
  route,
  city,
  date,
  resources,
  call,
  done,
}: {
  route?: Route;
  city: City;
  date: string;
  resources: Resource[];
  call: PickupCall;
  done: () => void;
}) {
  const [name, setName] = useState(route?.name ?? ""),
    [driver, setDriver] = useState(route?.driver_id ?? ""),
    [vehicle, setVehicle] = useState(route?.vehicle_id ?? ""),
    [depot, setDepot] = useState(route?.depot_id ?? ""),
    [start, setStart] = useState(route?.start_time ?? "08:00");
  return (
    <FormShell
      title={route ? "Изменить маршрут" : "Новый маршрут"}
      onClose={done}
      onSave={async () => {
        await call({
          action: "save_route",
          requestId: crypto.randomUUID(),
          id: route?.id,
          version: route?.version,
          city,
          date,
          name,
          driver_id: driver,
          vehicle_id: vehicle,
          depot_id: depot,
          start_time: start,
        });
      }}
    >
      <div className="pk-grid">
        <Field
          label="Название маршрута"
          value={name}
          onChange={setName}
          required
        />
        <Field
          label="Время старта"
          type="time"
          value={start}
          onChange={setStart}
          required
        />
        <Select
          label="Водитель"
          value={driver}
          onChange={setDriver}
          options={resources.filter((r) => r.kind === "driver" && r.active)}
          required
        />
        <Select
          label="Автомобиль"
          value={vehicle}
          onChange={setVehicle}
          options={resources
            .filter((r) => r.kind === "vehicle" && r.active)
            .map((r) => ({ id: r.id, name: `${r.name} · ${r.data.plate}` }))}
          required
        />
        <Select
          label="Конечная точка — склад Холз"
          value={depot}
          onChange={setDepot}
          options={resources.filter((r) => r.kind === "depot" && r.active)}
          required
        />
      </div>
      <p className="pk-muted">
        Если список пуст, добавьте записи в справочники этого города.
      </p>
    </FormShell>
  );
}

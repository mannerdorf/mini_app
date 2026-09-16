import { Trash2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import type {
  City,
  Resource,
  ResourceKind,
  Job,
  JobData,
  Route,
} from "../../../lib/pickup/model";
import { truckFields } from "../../../lib/pickup/routeAnalysis";
import { cities } from "../../../lib/pickup/model";
import type { PickupCall } from "./client";
import type { Account } from "../../types";
import {
  defaultPickupAddressState,
  jobDataToPickupAddressState,
  pickupAddressStateToJobPatch,
} from "./pickupJobAddressState";
import {
  defaultPickupDefaultPlaceState,
  defaultPlaceStateToJobPatch,
  jobDataToDefaultPlaceState,
} from "./pickupJobDefaultPlaceState";
import {
  PickupJobAddressSection,
  pickupCityToCode,
} from "./PickupJobAddressSection";
import { PickupJobDefaultPlaceSection } from "./PickupJobDefaultPlaceSection";
import { PickupVehicleResourceFields } from "./PickupVehicleResourceFields";
import { cloneJobDataForCopy } from "../../../lib/pickup/cloneJobData";
import {
  defaultPickupScheduleUiState,
  PickupScheduleSection,
  pickupScheduleUiToApi,
} from "./PickupScheduleSection";
import { expandPickupScheduleDates } from "../../../lib/pickup/pickupSchedule";
import { PickupWarehouseHoursField } from "./PickupWarehouseHoursField";
import { PickupInstructionChecklistField } from "./PickupInstructionChecklistField";
import { PickupSenderDefaults } from "./PickupSenderDefaults";
import { PickupCustomerQuoteSection } from "./PickupCustomerQuoteSection";
import {
  createDefaultPickupSiteInstructions,
  formatPickupSiteInstructions,
  parsePickupSiteInstructions,
} from "../../../lib/pickup/jobSiteInstructions";
import { PICKUP_PACKAGING_KIND_OPTIONS } from "../../../lib/pickup/packagingKindOptions";

const PICKUP_PACKAGING_DATALIST_ID = "pickup-packaging-kinds";

function PackagingKindField({
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
      <input
        type="text"
        list={PICKUP_PACKAGING_DATALIST_ID}
        value={value ?? ""}
        placeholder="Выберите или введите"
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={PICKUP_PACKAGING_DATALIST_ID}>
        {PICKUP_PACKAGING_KIND_OPTIONS.map((kind) => (
          <option key={kind} value={kind} />
        ))}
      </datalist>
    </label>
  );
}

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
type SenderContactRow = {
  id: string;
  name: string;
  phone: string;
  extension: string;
  purpose: string;
};
export function SenderContactDirectory({
  senderInn,
  call,
  onPick,
}: {
  senderInn: string;
  call: PickupCall;
  onPick: (c: Omit<SenderContactRow, "id">) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SenderContactRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  if (!senderInn) return null;
  return (
    <div className="pk-directory pk-directory--nested">
      <strong>Из справочника контактных лиц отправителя</strong>
      <div className="pk-actions">
        <input
          aria-label="Поиск контакта отправителя"
          placeholder="Имя или телефон"
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
              const r = await call({
                action: "directory",
                kind: "sender_contact",
                sender_inn: senderInn,
                q: query,
              });
              const list = (r.items ?? []) as SenderContactRow[];
              setItems(list);
              if (!list.length) setError("Контактов пока нет — сохраните забор с телефоном");
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
                  onPick({
                    name: i.name,
                    phone: i.phone,
                    extension: i.extension,
                    purpose: i.purpose || "Звонки",
                  });
                  setItems([]);
                }}
              >
                {i.name || "Без имени"} · {i.phone}
                {i.extension ? ` доб. ${i.extension}` : ""}
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
        onInvalidCapture={(e) => {
          let parent = (e.target as HTMLElement).parentElement;
          while (parent) {
            if (parent instanceof HTMLDetailsElement) parent.open = true;
            parent = parent.parentElement;
          }
        }}
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
        <div className="pk-actions pk-form-footer">
          <button className="pk-primary" disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
          <button
            type="button"
            className="pk-btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
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
  const defaultData = (): Record<string, string> =>
    kind === "driver"
      ? { type: "own" }
      : { from: "08:00", to: "18:00", type: "own", lift: "Нет" };
  const [data, setData] = useState<Record<string, string>>(
    resource?.data ?? defaultData(),
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
        const payload =
          kind === "driver"
            ? Object.fromEntries(
                Object.entries(data).filter(([key]) => key !== "from" && key !== "to"),
              )
            : data;
        await call({
          action: "save_resource",
          requestId: crypto.randomUUID(),
          id: resource?.id,
          version: resource?.version,
          kind,
          city,
          name,
          active,
          data: payload,
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
        {kind !== "driver" && (
          <>
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
          </>
        )}
      </div>
      {kind === "driver" && (
        <>
          <Field
            label="Логин (email) в приложении"
            value={data.login ?? ""}
            onChange={(v) => update("login", v.trim().toLowerCase())}
            required
            placeholder="driver@example.com"
          />
          <p className="pk-hint">
            Пользователь должен быть в CMS → Справочник пользователей с активным
            бейджем «Водитель».
          </p>
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
        <>
          <div className="pk-grid">
            <Field
              label="Госномер"
              value={data.plate}
              onChange={(v) => update("plate", v)}
              required
            />
          </div>
          <PickupVehicleResourceFields data={data} update={update} />
          <details className="pk-panel">
            <summary>Параметры для грузовой маршрутизации</summary>
            <p className="pk-hint">
              Внешние габариты всего ТС, а не размеры кузова. Масса с грузом —
              максимальная для этого рейса; перед проверкой уточните её.
              Пропуски указываются числовыми идентификаторами 2ГИС.
            </p>
            <div className="pk-grid">
              {truckFields.map(([field, label]) => (
                <Field
                  key={field}
                  label={label}
                  type="number"
                  value={data[field] || ""}
                  onChange={(v) => update(field, v)}
                />
              ))}
              {[
                ["truckDangerous", "Опасный груз"],
                ["truckExplosive", "Взрывоопасный груз"],
              ].map(([field, label]) => (
                <Select
                  key={field}
                  label={label}
                  value={data[field] || ""}
                  onChange={(v) => update(field, v)}
                  options={[
                    { id: "no", name: "Нет" },
                    { id: "yes", name: "Да" },
                  ]}
                />
              ))}
              <Field
                label="Идентификаторы пропусков 2ГИС"
                value={data.truckPassIds || ""}
                onChange={(v) => update("truckPassIds", v)}
              />
            </div>
          </details>
          <div className="pk-grid">
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
        </>
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
  issueCustomerBill: false,
  customerBillMode: "",
  requirements: "",
  note: "",
  latitude: null,
  longitude: null,
  deliveryMode: "courier",
  addressKind: "pvz",
  pvzRef: "",
  defaultPlaceAddress: "",
  defaultPlaceLatitude: null,
  defaultPlaceLongitude: null,
  defaultPlaceMode: "point",
  defaultPlaceKind: "pvz",
  defaultPlacePvzRef: "",
  scheduleMode: "",
  schedulePattern: "",
  scheduleGroupId: "",
  scheduleWeekdays: "",
  scheduleUntil: "",
  scheduleDates: "",
};
type NewJobDraft = {
  data: JobData;
  day: string;
  addressState: ReturnType<typeof defaultPickupAddressState>;
  defaultPlaceState: ReturnType<typeof defaultPickupDefaultPlaceState>;
  siteInstructions: ReturnType<typeof createDefaultPickupSiteInstructions>;
  scheduleUi: ReturnType<typeof defaultPickupScheduleUiState>;
};
export function JobForm({
  job,
  copyFrom,
  city,
  date,
  call,
  account,
  done,
  onCreatedMany,
}: {
  job?: Job;
  /** Новый забор с данными из существующего (без id). */
  copyFrom?: Job;
  city: City;
  date: string;
  call: PickupCall;
  account: Account;
  done: () => void;
  onCreatedMany?: (count: number) => void;
}) {
  const cityCode = pickupCityToCode(city);
  const draftKey = `pickup-new-draft:v1:${account.login.toLowerCase()}:${city}:${date}:${copyFrom?.id ?? "new"}`;
  const [restoredDraft] = useState<NewJobDraft | null>(() => {
    if (job) return null;
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
      return saved?.data &&
        Array.isArray(saved.data.places) &&
        Array.isArray(saved.data.contacts) &&
        saved.addressState &&
        saved.defaultPlaceState &&
        saved.siteInstructions &&
        saved.scheduleUi
        ? saved
        : null;
    } catch {
      return null;
    }
  });
  const [draftStatus, setDraftStatus] = useState(
    restoredDraft ? "Черновик восстановлен из этой вкладки." : "",
  );
  const [resetDraft, setResetDraft] = useState(false);
  const seedData =
    job?.data ?? (copyFrom ? cloneJobDataForCopy(copyFrom.data) : undefined);
  const [data, setData] = useState<JobData>(
    restoredDraft?.data ?? seedData ?? emptyData,
  );
  const [day, setDay] = useState(restoredDraft?.day ?? job?.date ?? date);
  const [addressState, setAddressState] = useState(
    () =>
      restoredDraft?.addressState ??
      (seedData
        ? jobDataToPickupAddressState(seedData, cityCode)
        : defaultPickupAddressState(cityCode)),
  );
  const [defaultPlaceState, setDefaultPlaceState] = useState(
    () =>
      restoredDraft?.defaultPlaceState ??
      (seedData
        ? jobDataToDefaultPlaceState(seedData, cityCode)
        : defaultPickupDefaultPlaceState(cityCode)),
  );
  const [siteInstructions, setSiteInstructions] = useState(
    () =>
      restoredDraft?.siteInstructions ??
      (seedData?.instructions
        ? parsePickupSiteInstructions(seedData.instructions)
        : createDefaultPickupSiteInstructions()),
  );
  const [scheduleUi, setScheduleUi] = useState(
    () => restoredDraft?.scheduleUi ?? defaultPickupScheduleUiState(),
  );
  useEffect(() => {
    if (job) return;
    try {
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          data,
          day,
          addressState,
          defaultPlaceState,
          siteInstructions,
          scheduleUi,
        }),
      );
      setDraftStatus(
        restoredDraft
          ? "Черновик восстановлен. Изменения сохраняются в этой вкладке."
          : "Черновик сохраняется в этой вкладке до её закрытия.",
      );
    } catch {
      setDraftStatus(
        "Не удалось сохранить черновик на устройстве. Не закрывайте форму до сохранения.",
      );
    }
  }, [
    job,
    draftKey,
    data,
    day,
    addressState,
    defaultPlaceState,
    siteInstructions,
    scheduleUi,
    restoredDraft,
  ]);
  const update = (key: keyof JobData, v: any) =>
    setData((prev) => ({ ...prev, [key]: v }));
  const patchJob = (patch: Partial<JobData>) =>
    setData((prev) => ({ ...prev, ...patch }));

  useEffect(() => {
    setAddressState((prev) =>
      prev.city === cityCode ? prev : { ...prev, city: cityCode },
    );
    setDefaultPlaceState((prev) => {
      if (prev.city === cityCode) return prev;
      if (prev.deliveryMode === "point" && !prev.pvzRef && !prev.query.trim()) {
        return defaultPickupDefaultPlaceState(cityCode);
      }
      return { ...prev, city: cityCode };
    });
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
        prev.deliveryMode === fields.deliveryMode &&
        prev.addressKind === fields.addressKind &&
        prev.pvzRef === fields.pvzRef &&
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
        deliveryMode: fields.deliveryMode,
        addressKind: fields.addressKind,
        pvzRef: fields.pvzRef,
        contacts,
      };
    });
  }, [addressState]);

  useEffect(() => {
    const fields = defaultPlaceStateToJobPatch(defaultPlaceState);
    setData((prev) => {
      if (
        prev.defaultPlaceAddress === fields.defaultPlaceAddress &&
        prev.defaultPlaceLatitude === fields.defaultPlaceLatitude &&
        prev.defaultPlaceLongitude === fields.defaultPlaceLongitude &&
        prev.defaultPlaceMode === fields.defaultPlaceMode &&
        prev.defaultPlaceKind === fields.defaultPlaceKind &&
        prev.defaultPlacePvzRef === fields.defaultPlacePvzRef
      ) {
        return prev;
      }
      return { ...prev, ...fields };
    });
  }, [defaultPlaceState]);

  useEffect(() => {
    const instructions = formatPickupSiteInstructions(siteInstructions);
    setData((prev) =>
      prev.instructions === instructions ? prev : { ...prev, instructions },
    );
  }, [siteInstructions]);

  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <FormShell
      title={
        job
          ? "Редактировать забор"
          : copyFrom
            ? "Новый забор (копия)"
            : "Новый забор"
      }
      onClose={done}
      onSave={async () => {
        const schedulePayload = !job
          ? pickupScheduleUiToApi(scheduleUi, day)
          : undefined;
        if (!job && scheduleUi.mode === "periodic") {
          expandPickupScheduleDates({
            mode: "periodic",
            pattern: scheduleUi.pattern,
            startDate: day,
            until: scheduleUi.until,
            weekdays: scheduleUi.weekdays,
            dates: (schedulePayload?.dates as string[]) ?? [],
          });
        }
        const result = await call({
          action: "save_job",
          requestId: crypto.randomUUID(),
          id: job?.id,
          version: job?.version,
          city,
          date: day,
          data,
          schedule: schedulePayload,
        });
        const count = Number(
          (result as { createdCount?: number })?.createdCount,
        );
        if (!job) {
          try {
            sessionStorage.removeItem(draftKey);
          } catch {
            /* Save already succeeded on the server. */
          }
        }
        if (count > 1) onCreatedMany?.(count);
      }}
    >
      {copyFrom && (
        <p className="pk-warning">
          Создаётся отдельный забор. Проверьте дату и количество оставшихся
          мест; исходная заявка сохранится.
        </p>
      )}
      {!job && (
        <div className="pk-draft-note">
          <p role="status">{draftStatus}</p>
          {!resetDraft ? (
            <button
              type="button"
              className="pk-link-btn"
              onClick={() => setResetDraft(true)}
            >
              Начать заново
            </button>
          ) : (
            <div className="pk-actions">
              <span>Очистить введённые данные?</span>
              <button
                type="button"
                onClick={() => {
                  setData(emptyData);
                  setDay(date);
                  setAddressState(defaultPickupAddressState(cityCode));
                  setDefaultPlaceState(
                    defaultPickupDefaultPlaceState(cityCode),
                  );
                  setSiteInstructions(createDefaultPickupSiteInstructions());
                  setScheduleUi(defaultPickupScheduleUiState());
                  setResetDraft(false);
                }}
              >
                Очистить
              </button>
              <button type="button" onClick={() => setResetDraft(false)}>
                Оставить
              </button>
            </div>
          )}
        </div>
      )}
      <p className="pk-hint">
        Обязательные поля отмечены *. Дополнительные сведения можно раскрыть по
        мере заполнения.
      </p>
      <details className="pk-form-section" open>
        <summary>
          <span className="pk-form-step">1</span> Заказчик и отправитель
        </summary>
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
      </details>
      <details className="pk-form-section" open>
        <summary>
          <span className="pk-form-step">2</span> Где и когда забрать
        </summary>
        <div className="pk-grid">
          <Field
            label="Дата пикапа"
            type="date"
            value={day}
            onChange={setDay}
            required
          />
        </div>
        <details className="pk-form-extra">
          <summary>Повторять забор по графику</summary>
          <PickupScheduleSection
            startDate={day}
            state={scheduleUi}
            onChange={setScheduleUi}
            disabled={Boolean(job?.id)}
          />
        </details>
        <PickupSenderDefaults
          key={`${city}:${data.senderInn}`}
          senderInn={data.senderInn}
          city={city}
          call={call}
          onApply={(patch) => {
            const next = {
              ...data,
              ...patch,
              deliveryMode: "courier" as const,
              addressKind: "custom" as const,
              pvzRef: "",
            };
            setData(next);
            setAddressState(jobDataToPickupAddressState(next, cityCode));
            setSiteInstructions(parsePickupSiteInstructions(next.instructions));
          }}
        />
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
      <SenderContactDirectory
        senderInn={data.senderInn}
        call={call}
        onPick={(picked) => {
          setData((prev) => {
            const idx = prev.contacts.findIndex(
              (c) => !c.phone.replace(/\D/g, "").length && !c.name.trim(),
            );
            const row = {
              name: picked.name,
              phone: picked.phone,
              extension: picked.extension,
              purpose: picked.purpose,
            };
            if (idx >= 0) {
              const contacts = [...prev.contacts];
              contacts[idx] = row;
              return { ...prev, contacts };
            }
            return { ...prev, contacts: [...prev.contacts, row] };
          });
        }}
      />
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
              className="pk-delete-icon"
              aria-label="Удалить контакт"
              title="Удалить контакт"
              type="button"
              onClick={() =>
                update(
                  "contacts",
                  data.contacts.filter((_, n) => n !== i),
                )
              }
            >
              <Trash2 size={16} aria-hidden />
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
      </details>
      <details className="pk-form-section" open>
        <summary>
          <span className="pk-form-step">3</span> Груз и погрузка
        </summary>
        <h3>Грузовые места</h3>
        {data.places.map((p, i) => (
          <div className="pk-subrow" key={i}>
            <div className="pk-grid">
              <PackagingKindField
                label="Упаковка"
                value={p.kind}
                onChange={(v) =>
                  update(
                    "places",
                    data.places.map((r, n) =>
                      n === i ? { ...r, kind: v } : r,
                    ),
                  )
                }
              />
              <Field
                label="Количество"
                type="number"
                min="1"
                step="1"
                value={p.count}
                onChange={(v) =>
                  update(
                    "places",
                    data.places.map((r, n) =>
                      n === i ? { ...r, count: num(v) ?? 1 } : r,
                    ),
                  )
                }
                required
              />
            </div>
            <button
              className="pk-delete-icon"
              aria-label="Удалить группу мест"
              title="Удалить группу мест"
              type="button"
              onClick={() =>
                update(
                  "places",
                  data.places.filter((_, n) => n !== i),
                )
              }
            >
              <Trash2 size={16} aria-hidden />
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
      </details>
      <details className="pk-form-section" open>
        <summary>
          <span className="pk-form-step">4</span> Место выгрузки
        </summary>
        <PickupJobDefaultPlaceSection
          account={account}
          city={city}
          customerInn={data.customerInn}
          customerName={data.customerName}
          state={defaultPlaceState}
          onChange={setDefaultPlaceState}
        />
      </details>
      <details className="pk-form-section">
        <summary>
          <span className="pk-form-step">5</span> Стоимость и документы{" "}
          <small>Дополнительно</small>
        </summary>
        <div className="pk-grid">
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
        <PickupCustomerQuoteSection
          city={city}
          data={data}
          call={call}
          onPatch={patchJob}
          num={num}
        />
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
                  data.documents.map((r, n) =>
                    n === i ? { ...r, date: v } : r,
                  ),
                )
              }
            />
            <button
              className="pk-delete-icon"
              aria-label="Удалить документ"
              title="Удалить документ"
              type="button"
              onClick={() =>
                update(
                  "documents",
                  data.documents.filter((_, n) => n !== i),
                )
              }
            >
              <Trash2 size={16} aria-hidden />
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
      </details>
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
    [start, setStart] = useState(route?.start_time ?? "08:00"),
    [startMode, setStartMode] = useState(route?.snapshot.start?.mode ?? "depot"),
    [startAddress, setStartAddress] = useState(route?.snapshot.start?.address ?? "");
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
          start_time: start,
          start_mode: startMode,
          start_address: startAddress,
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
          label="Место старта"
          value={startMode}
          onChange={(value) => setStartMode(value as "depot" | "address")}
          options={[{ id: "depot", name: "Склад HAULZ" }, { id: "address", name: "Другой адрес" }]}
          required
        />
        {startMode === "address" && (
          <Field label="Адрес старта" value={startAddress} onChange={setStartAddress}
            required placeholder="Город, улица, дом — например, стоянка автомобиля" />
        )}
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
      </div>
      <p className="pk-muted">
        Конечная точка маршрута — склад HAULZ в {cities[city]} (подставляется
        автоматически). Если водителей или машин нет в списке — добавьте их во
        вкладках «Водители» и «Автомобили».
      </p>
    </FormShell>
  );
}

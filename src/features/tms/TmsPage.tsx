import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  RefreshCw,
  Truck,
  Ship,
  Download,
  Package,
  ChevronDown,
} from "lucide-react";
import type { AuthData } from "../../types";
import { apiFetchJson } from "../../utils";
import {
  VEHICLES,
  type TmsCargo,
  type PlanOptions,
  type LoadPlan,
  type Vehicle,
  type PackageGroup,
} from "./model";
import { cargoProblem, validateOptions } from "./planner";
import { LoadScene, COLORS } from "./LoadScene";
import { PackageEditor } from "./PackageEditor";
import "./tms.css";
const fmt = (n: number, d = 1) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: d });
const date = (s: string) => (s ? s.split("-").reverse().join(".") : "Нет даты");
const sum = (rows: TmsCargo[], key: "weight" | "volume" | "places") =>
  rows.reduce((s, c) => s + (c[key] ?? 0), 0);
function MultiSelect({
  label,
  customers,
  selected,
  onChange,
}: {
  label: string;
  customers: { id: string; name: string }[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: Event) => {
      const menu = menuRef.current;
      if (
        menu?.open &&
        event.target instanceof Node &&
        !menu.contains(event.target)
      ) {
        menu.open = false;
      }
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("focusin", closeOutside, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("focusin", closeOutside, true);
    };
  }, []);
  return (
    <details
      className="tms-multi"
      ref={menuRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary>
        {label}
        <span>
          {selected.length || "Все без отметки"} <ChevronDown size={14} />
        </span>
      </summary>
      <div className="tms-multi-menu">
        <input
          aria-label={`Поиск: ${label}`}
          placeholder="Найти заказчика"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={() => onChange([])}>Снять отметки</button>
        {customers
          .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
          .map((c) => (
            <label key={c.id}>
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...selected, c.id]
                      : selected.filter((id) => id !== c.id),
                  )
                }
              />
              {c.name}
            </label>
          ))}
      </div>
    </details>
  );
}
function ResultTable({ plan }: { plan: LoadPlan }) {
  const [view, setView] = useState<"cargo" | "customer" | "receiver">("cargo");
  const groups = useMemo(() => {
    const result = new Map<string, TmsCargo[]>();
    plan.selected.forEach((c) => {
      const key =
        view === "customer"
          ? c.customerId
          : view === "receiver"
            ? c.receiver
            : c.id;
      result.set(key, [...(result.get(key) ?? []), c]);
    });
    return [...result.values()];
  }, [plan, view]);
  return (
    <>
      <div className="tms-tabs">
        {(["cargo", "customer", "receiver"] as const).map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
            {v === "cargo"
              ? "По перевозкам"
              : v === "customer"
                ? "По заказчикам"
                : "По получателям"}
          </button>
        ))}
      </div>
      <div className="tms-table-scroll">
        <table>
          <thead>
            <tr>
              <th>
                № /{" "}
                {view === "cargo"
                  ? "Перевозка"
                  : view === "customer"
                    ? "Заказчик"
                    : "Получатель"}
              </th>
              <th>
                {view === "cargo" ? "Заказчик / получатель" : "Перевозки"}
              </th>
              <th>Мест</th>
              <th>Вес, кг</th>
              <th>Объём, м³</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => (
              <tr key={g[0].id}>
                <td>
                  {view === "cargo" ? (
                    <>
                      <span
                        className="tms-dot"
                        style={{ background: COLORS[i % COLORS.length] }}
                      />
                      {i + 1}. <b>{g[0].number}</b>
                    </>
                  ) : view === "customer" ? (
                    g[0].customer
                  ) : (
                    g[0].receiver
                  )}
                </td>
                <td>
                  {view === "cargo" ? (
                    <>
                      {g[0].customer}
                      <small>{g[0].receiver}</small>
                    </>
                  ) : (
                    g.map((c) => c.number).join(", ")
                  )}
                </td>
                <td>{fmt(sum(g, "places"), 0)}</td>
                <td>{fmt(sum(g, "weight"))}</td>
                <td>{fmt(sum(g, "volume"), 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
export function TmsPage({
  auth,
  onBack,
}: {
  auth: AuthData;
  onBack: () => void;
}) {
  const [items, setItems] = useState<TmsCargo[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [checkedAt, setCheckedAt] = useState("");
  const [assigned, setAssigned] = useState(0);
  const [packages, setPackages] = useState<Record<string, PackageGroup[]>>({});
  const [requireDimensions, setRequireDimensions] = useState(false);
  const [estimatedTopLoadFactor, setEstimatedTopLoadFactor] = useState(2);
  const [estimatedStacking, setEstimatedStacking] = useState<"height" | "load">("height");
  const [editing, setEditing] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const [mode, setMode] = useState<Vehicle["mode"]>("road"),
    [vehicle, setVehicle] = useState<Vehicle>(() =>
      structuredClone(VEHICLES[0]),
    );
  const [strictSelection, setStrictSelection] = useState(false);
  const [order, setOrder] = useState<"fifo" | "lifo">("fifo"),
    [priority, setPriority] = useState<string[]>([]),
    [floorCustomers, setFloorCustomers] = useState<string[]>([]);
  const [pallets, setPallets] = useState<Record<string, number>>({}),
    [palletWidth, setPalletWidth] = useState(0.8),
    [reservePercent, setReservePercent] = useState(5);
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [route, setRoute] = useState(""),
    [grouping, setGrouping] = useState<"customer" | "date">("customer");
  const [excluded, setExcluded] = useState<string[]>([]),
    [plan, setPlan] = useState<LoadPlan | null>(null),
    [planError, setPlanError] = useState("");
  useEffect(() => {
    setPallets({});
    setPackages({});
    setEditing(null);
    setExcluded([]);
    setPriority([]);
    setFloorCustomers([]);
  }, [auth.login, auth.password]);
  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setLoading(true);
    setError("");
    setPlan(null);
    const post = (numbers?: string[]) =>
      apiFetchJson<{ items: TmsCargo[]; assigned: number; checkedAt: string }>(
        "/api/tms-backlog",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...auth, numbers }),
        },
      );
    (async () => {
      try {
        const data = await post();
        if (cancelled) return;
        setItems(data.items);
        setAssigned(data.assigned);
        setCheckedAt(data.checkedAt);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Не удалось загрузить перевозки",
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.login, auth.password, revision]);
  const options: PlanOptions = useMemo(
    () => ({
      vehicle,
      packages,
      requireDimensions,
      estimatedTopLoadFactor,
      estimatedStacking,
      order,
      strictSelection,
      priority,
      floorCustomers,
      pallets,
      palletLength: 1.2,
      palletWidth,
      reservePercent,
    }),
    [
      vehicle,
      packages,
      requireDimensions,
      estimatedTopLoadFactor,
      estimatedStacking,
      order,
      strictSelection,
      priority,
      floorCustomers,
      pallets,
      palletWidth,
      reservePercent,
    ],
  );
  useEffect(() => {
    setPlan(null);
    setPlanError("");
    workerRef.current?.terminate();
    workerRef.current = null;
    setCalculating(false);
  }, [options, items, from, to, route, excluded]);
  const customers = useMemo(
    () =>
      [
        ...new Map(
          items.map((c) => [
            c.customerId,
            { id: c.customerId, name: c.customer },
          ]),
        ).values(),
      ].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [items],
  );
  const routes = useMemo(
    () => [...new Set(items.map((c) => c.route))].sort(),
    [items],
  );
  const filtered = items.filter(
    (c) =>
      (!from || c.received >= from) &&
      (!to || c.received <= to) &&
      (!route || c.route === route),
  );
  const ready = filtered.filter((c) => c.readiness === "ready"),
    unresolved = filtered.filter((c) =>
      ["unknown", "unreceived", "pending"].includes(c.readiness),
    );
  const candidates = ready.filter((c) => !excluded.includes(c.id));
  const groups = new Map<string, TmsCargo[]>();
  ready.forEach((c) => {
    const key = grouping === "customer" ? c.customerId : c.received;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  });
  const pickVehicle = (id: string) => {
    const p = VEHICLES.find((v) => v.id === id);
    if (p) setVehicle(structuredClone(p));
  };
  const toggleGroup = (rows: TmsCargo[], include: boolean) =>
    setExcluded((current) =>
      include
        ? current.filter((id) => !rows.some((c) => c.id === id))
        : [...new Set([...current, ...rows.map((c) => c.id)])],
    );
  useEffect(() => () => workerRef.current?.terminate(), []);
  const calculate = () => {
    if (from && to && from > to) {
      setPlanError("Начало периода должно быть раньше конца");
      return;
    }
    const error = validateOptions(options);
    if (error) {
      setPlanError(error);
      return;
    }
    workerRef.current?.terminate();
    const worker = new Worker(new URL("./planner.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    setCalculating(true);
    setPlanError("");
    setPlan(null);
    worker.onmessage = (e) => {
      if (workerRef.current !== worker) return;
      setCalculating(false);
      setPlan(e.data.plan ?? null);
      setPlanError(e.data.error ?? "");
      worker.terminate();
      workerRef.current = null;
    };
    worker.onerror = () => {
      if (workerRef.current !== worker) return;
      setCalculating(false);
      setPlanError("Ошибка расчёта. Уменьшите выборку и повторите.");
      worker.terminate();
      workerRef.current = null;
    };
    worker.postMessage({ cargo: candidates, options });
  };
  const export3d = () => {
    if (!plan) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { version: 1, createdAt: new Date().toISOString(), options, plan },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "tms-3d-plan.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportPlan = () => {
    if (!plan) return;
    const cell = (v: unknown) =>
      `"${String(v ?? "")
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""')}"`;
    const rows = [
      [
        "Перевозка",
        "Заказчик",
        "Получатель",
        "Маршрут",
        "Приёмка",
        "Вес, кг",
        "Объём, м3",
        "Мест",
        "Палет по полу",
      ],
      ...plan.selected.map((c) => [
        c.number,
        c.customer,
        c.receiver,
        c.route,
        c.received,
        c.weight,
        c.volume,
        c.places,
        floorCustomers.includes(c.customerId) ? pallets[c.id] : 0,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "tms-load-plan.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="tms">
      {editing && items.find((c) => c.id === editing) && (
        <PackageEditor
          key={editing}
          cargo={items.find((c) => c.id === editing)!}
          options={options}
          onClose={() => setEditing(null)}
          onSave={(groups) => setPackages({ ...packages, [editing]: groups })}
        />
      )}
      <header className="tms-header">
        <button className="tms-icon" onClick={onBack} aria-label="Назад">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1>
            TMS <span>Планирование загрузки</span>
          </h1>
          <p>Подбор перевозок в одно транспортное средство</p>
        </div>
        <button
          className="tms-refresh"
          disabled={loading}
          onClick={() => setRevision((v) => v + 1)}
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Обновить
        </button>
      </header>
      <section className="tms-card">
        <div className="tms-section-heading">
          <h2>Параметры рейса</h2>
          <div className="tms-tabs">
            {(["road", "ferry"] as const).map((m) => (
              <button
                key={m}
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  pickVehicle(VEHICLES.find((v) => v.mode === m)!.id);
                }}
              >
                {m === "road" ? <Truck size={16} /> : <Ship size={16} />}{" "}
                {m === "road" ? "Авто" : "Паром"}
              </button>
            ))}
          </div>
        </div>
        <div className="tms-fields">
          <label>
            Тип {mode === "road" ? "ТС" : "контейнера"}
            <select
              value={vehicle.id}
              onChange={(e) => pickVehicle(e.target.value)}
            >
              {VEHICLES.filter((v) => v.mode === mode).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Маршрут
            <select value={route} onChange={(e) => setRoute(e.target.value)}>
              <option value="">Все · выберите один для расчёта</option>
              {routes.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Очередность
            <select
              value={order}
              onChange={(e) => setOrder(e.target.value as "fifo" | "lifo")}
            >
              <option value="fifo">FIFO · сначала ранние</option>
              <option value="lifo">LIFO · сначала поздние</option>
            </select>
          </label>
          <label>
            Приёмка с
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Приёмка по
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label>
            Резерв вместимости, %
            <input
              type="number"
              min="0"
              max="99"
              value={reservePercent}
              onChange={(e) => setReservePercent(Number(e.target.value))}
            />
          </label>
          <MultiSelect
            label="Высокий приоритет"
            customers={customers}
            selected={priority}
            onChange={setPriority}
          />
          <MultiSelect
            label="Палеты по полу"
            customers={customers}
            selected={floorCustomers}
            onChange={setFloorCustomers}
          />
          <label>
            Размер палеты
            <select
              value={palletWidth}
              onChange={(e) => setPalletWidth(Number(e.target.value))}
            >
              <option value="0.8">EUR · 120 × 80 см</option>
              <option value="1">FIN · 120 × 100 см</option>
            </select>
          </label>
        </div>
        <label className="tms-strict">
          <input
            type="checkbox"
            role="switch"
            checked={strictSelection}
            onChange={(e) => setStrictSelection(e.target.checked)}
            aria-describedby="tms-strict-hint"
          />
          <span className="tms-switch-track" aria-hidden="true" />
          <span>
            <b>Строгий отбор</b>
            <small id="tms-strict-hint">
              Без пропусков: остановиться, если очередная перевозка не
              помещается или не хватает данных.
            </small>
          </span>
        </label>
        <details className="tms-capacity">
          <summary>
            Вместимость: {fmt(vehicle.payload)} кг · {fmt(vehicle.volume)} м³{" "}
            <span>Изменить параметры ТС</span>
          </summary>
          <p className="tms-muted">
            Типовые значения для планирования. Укажите фактическую
            грузоподъёмность и внутренние размеры выбранного ТС. Для Open Top и
            Flat Rack расчёт только в пределах заданного габарита.
          </p>
          <div className="tms-fields">
            <label>
              Грузоподъёмность, кг
              <input
                type="number"
                min="1"
                value={vehicle.payload}
                onChange={(e) =>
                  setVehicle({ ...vehicle, payload: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Допустимый объём, м³
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={vehicle.volume}
                onChange={(e) =>
                  setVehicle({ ...vehicle, volume: Number(e.target.value) })
                }
              />
            </label>
          </div>
          {vehicle.compartments.map((c, i) => (
            <div className="tms-fields" key={i}>
              {(["length", "width", "height"] as const).map((key, k) => (
                <label key={key}>
                  Кузов {i + 1} · {["длина", "ширина", "высота"][k]}, м
                  <input
                    type="number"
                    min="0.1"
                    step="0.01"
                    value={c[key]}
                    onChange={(e) =>
                      setVehicle({
                        ...vehicle,
                        compartments: vehicle.compartments.map((b, j) =>
                          j === i ? { ...b, [key]: Number(e.target.value) } : b,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          ))}
        </details>
      </section>
      {error && (
        <div className="tms-alert" role="alert">
          {error}{" "}
          <button disabled={loading} onClick={() => setRevision((v) => v + 1)}>
            Повторить загрузку
          </button>
        </div>
      )}
      <div className="tms-stats">
        <div>
          <small>К планированию</small>
          <strong>
            {ready.length} <span>перевозок</span>
          </strong>
        </div>
        <div>
          <small>Фактический вес</small>
          <strong>
            {fmt(sum(candidates, "weight"))} <span>кг</span>
          </strong>
        </div>
        <div>
          <small>Объём</small>
          <strong>
            {fmt(sum(candidates, "volume"), 2)} <span>м³</span>
          </strong>
        </div>
        <div>
          <small>Выбрано для расчёта</small>
          <strong>
            {candidates.length} <span>из {ready.length}</span>
          </strong>
        </div>
      </div>
      <section className="tms-card tms-rules">
        <div>
          <h2>Правила размещения · 3D</h2>
          <p className="tms-muted">
            Палеты на полу. Плотный и тяжёлый груз — ниже; лёгкий — на
            разрешённых опорах. Учитываем суммарную нагрузку всех верхних
            ярусов.
          </p>
        </div>
        <label>
          <input
            type="checkbox"
            checked={requireDimensions}
            onChange={(e) => setRequireDimensions(e.target.checked)}
          />{" "}
          Только с проверенными габаритами мест
        </label>
        {!requireDimensions && (
          <div className="tms-fields">
            <label>
              Укладка без замеров
              <select value={estimatedStacking} onChange={(e) => setEstimatedStacking(e.target.value as "height" | "load")}>
                <option value="height">До потолка · предварительный расчёт</option>
                <option value="load">Ограничить массу сверху</option>
              </select>
            </label>
            <label>
              Нагрузка сверху · ×{Number.isFinite(estimatedTopLoadFactor) ? estimatedTopLoadFactor : "—"} собственного веса
              <input type="range" aria-label="Нагрузка сверху в собственных массах"
                min={0} max={20} step={0.5} value={Number.isFinite(estimatedTopLoadFactor) ? estimatedTopLoadFactor : 0}
                onChange={(e) => { setEstimatedTopLoadFactor(+e.target.value); setEstimatedStacking("load"); }} />
              <input type="number" aria-label="Множитель нагрузки сверху" min={0} max={20} step={0.5}
                value={Number.isFinite(estimatedTopLoadFactor) ? estimatedTopLoadFactor : ""} onChange={(e) => {
                  setEstimatedTopLoadFactor(e.target.value === "" ? NaN : +e.target.value); setEstimatedStacking("load");
                }} />
              <small>{estimatedStacking === "height"
                ? "Без ограничения прочности в предварительной модели. Бегунок включит ограничение массы."
                : `Место 10 кг: суммарно сверху до ${Number.isFinite(estimatedTopLoadFactor) ? estimatedTopLoadFactor * 10 : "—"} кг. 0 — ничего сверху.`}</small>
            </label>
          </div>
        )}
        <p className="tms-muted">
          {requireDimensions
            ? "Без введённых габаритов перевозка не попадёт в расчёт. В строгой очереди она остановит подбор."
            : "Без замеров размеры мест расчётные. В режиме «До потолка» прочность упаковки не подтверждена: учитываем высоту, опоры, плотность и грузоподъёмность ТС. Бегунок задаёт суммарную массу всех верхних ярусов. Ручные запреты и нагрузки имеют приоритет. Палета на палету — только с явным разрешением."}
        </p>
      </section>
      <section className="tms-card">
        <div className="tms-section-heading">
          <h2>Неотправленные перевозки</h2>
          <div className="tms-tabs">
            <button
              aria-pressed={grouping === "customer"}
              onClick={() => setGrouping("customer")}
            >
              По заказчикам
            </button>
            <button
              aria-pressed={grouping === "date"}
              onClick={() => setGrouping("date")}
            >
              По датам
            </button>
          </div>
        </div>
        <div className="tms-status" aria-live="polite">
          {loading
            ? "Загрузка из БД…"
            : checkedAt
              ? `Данные БД загружены ${new Date(checkedAt).toLocaleString("ru-RU")}`
              : "Загрузка…"}
          {assigned > 0 && ` · Уже связаны с отправками: ${assigned}`}
        </div>
        {!ready.length && (
          <p className="tms-empty">
            {loading
              ? "Загружаем поступившие перевозки без связи с отправкой."
              : "Нет неотправленных перевозок по выбранным условиям."}
          </p>
        )}
        {[...groups.entries()]
          .sort((a, b) =>
            grouping === "date"
              ? (order === "fifo" ? 1 : -1) * a[0].localeCompare(b[0])
              : a[1][0].customer.localeCompare(b[1][0].customer, "ru"),
          )
          .map(([key, rows]) => (
            <details className="tms-group" key={`${grouping}:${key}`}>
              <summary>
                <b>{grouping === "date" ? date(key) : rows[0].customer}</b>
                <span>
                  {rows.length} перев. · {fmt(sum(rows, "weight"))} кг ·{" "}
                  {fmt(sum(rows, "volume"), 2)} м³
                </span>
                <ChevronDown size={16} />
              </summary>
              <div className="tms-group-actions">
                <button onClick={() => toggleGroup(rows, true)}>
                  Выбрать группу
                </button>
                <button onClick={() => toggleGroup(rows, false)}>
                  Исключить группу
                </button>
              </div>
              <div className="tms-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>В расчёт</th>
                      <th>Перевозка / приёмка</th>
                      <th>Заказчик / получатель</th>
                      <th>Маршрут</th>
                      <th>Мест</th>
                      <th>Вес, кг</th>
                      <th>Объём, м³</th>
                      <th>Палет по полу</th>
                      <th>Габариты / укладка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Включить ${c.number}`}
                            checked={!excluded.includes(c.id)}
                            onChange={(e) => toggleGroup([c], e.target.checked)}
                          />
                        </td>
                        <td>
                          <b>{c.number}</b>
                          {priority.includes(c.customerId) && (
                            <span className="tms-priority">Приоритет</span>
                          )}
                          <small>{date(c.received)}</small>
                          {cargoProblem(c, options) && (
                            <small className="tms-problem">
                              {cargoProblem(c, options)}
                            </small>
                          )}
                        </td>
                        <td>
                          {c.customer}
                          <small>{c.receiver}</small>
                        </td>
                        <td>{c.route}</td>
                        <td>{c.places ?? "—"}</td>
                        <td>{c.weight === null ? "—" : fmt(c.weight)}</td>
                        <td>{c.volume === null ? "—" : fmt(c.volume, 2)}</td>
                        <td>
                          {floorCustomers.includes(c.customerId) ? (
                            <input
                              className="tms-pallet-input"
                              aria-label={`Палеты ${c.number}`}
                              type="number"
                              min="1"
                              max="1000"
                              step="1"
                              placeholder="Кол-во"
                              value={pallets[c.id] ?? ""}
                              onChange={(e) =>
                                setPallets({
                                  ...pallets,
                                  [c.id]: Number(e.target.value),
                                })
                              }
                            />
                          ) : (
                            <span className="tms-muted">Поштучно</span>
                          )}
                        </td>
                        <td>
                          <button onClick={() => setEditing(c.id)}>
                            {packages[c.id]?.length
                              ? "Габариты введены"
                              : "Указать габариты"}
                          </button>
                          <small>
                            {c.weight && c.volume
                              ? `${fmt(c.weight / c.volume)} кг/м³`
                              : "Нет плотности"}
                          </small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        {unresolved.length > 0 && (
          <details className="tms-unresolved">
            <summary>Нет данных для планирования · {unresolved.length}</summary>
            <p className="tms-muted">
              Эти перевозки не участвуют в расчёте: в БД не заполнена дата
              поступления. Данные обновляет существующая синхронизация.
            </p>
            <div className="tms-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Перевозка</th>
                    <th>Заказчик</th>
                    <th>Причина</th>
                  </tr>
                </thead>
                <tbody>
                  {unresolved.map((c) => (
                    <tr key={c.id}>
                      <td>{c.number}</td>
                      <td>{c.customer}</td>
                      <td>{c.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
        <div className="tms-calculate">
          <div>
            <b>Сначала приоритетные заказчики, затем FIFO / LIFO</b>
            <p>
              {strictSelection
                ? "Перевозки целиком, строго по очереди. При препятствии расчёт остановится."
                : "Перевозки целиком. Допускается пропуск ради лучшего заполнения."}
            </p>
          </div>
          <button
            className="tms-primary"
            disabled={!candidates.length || loading || calculating}
            onClick={calculate}
          >
            <Package size={18} />
            {calculating ? "Расчёт 3D…" : "Рассчитать 3D"}
          </button>
          {calculating && (
            <button
              onClick={() => {
                workerRef.current?.terminate();
                workerRef.current = null;
                setCalculating(false);
              }}
            >
              Отменить расчёт
            </button>
          )}
        </div>
        {(planError || validateOptions(options)) && (
          <p role="alert" className="tms-problem">
            {planError || validateOptions(options)}
          </p>
        )}
      </section>
      {plan && (
        <section className="tms-card tms-result">
          <div className="tms-section-heading">
            <div>
              <h2>План загрузки</h2>
              <p className="tms-muted">
                {vehicle.name} · {plan.selected[0]?.route ?? route} ·{" "}
                {plan.selected.length} перевозок
              </p>
            </div>
            <button disabled={!plan.selected.length} onClick={export3d}>
              <Download size={16} /> Скачать 3D-план
            </button>
            <button disabled={!plan.selected.length} onClick={exportPlan}>
              <Download size={16} />
              Скачать список
            </button>
          </div>
          <div className="tms-utilization">
            {[
              {
                name: "Вес",
                value: plan.weight,
                limit: plan.payloadLimit,
                unit: "кг",
              },
              {
                name: "Объём",
                value: plan.volume,
                limit: plan.volumeLimit,
                unit: "м³",
              },
              {
                name: "Пол",
                value: plan.floorArea,
                limit: vehicle.compartments.reduce(
                  (s, c) => s + c.length * c.width,
                  0,
                ),
                unit: "м²",
              },
            ].map((m) => (
              <div key={m.name}>
                <span>
                  {m.name}
                  <b>{fmt((m.value / m.limit) * 100)}%</b>
                </span>
                <progress max={m.limit} value={m.value} />
                <small>
                  {fmt(m.value)} / {fmt(m.limit)} {m.unit}
                </small>
              </div>
            ))}
          </div>
          <p className="tms-muted">
            Вес и объём — с резервом {reservePercent}%. Палет по полу:{" "}
            {plan.pallets}.{" "}
            {strictSelection
              ? "Строгий отбор: без пропусков в выбранной очереди."
              : "Подобран лучший из шести проверенных вариантов."}
          </p>
          <LoadScene
            plan={plan}
            vehicle={vehicle}
            estimatedTopLoadFactor={estimatedTopLoadFactor}
            estimatedStacking={estimatedStacking}
          />
          <ResultTable plan={plan} />
          {plan.omitted.length > 0 && (
            <details className="tms-unresolved">
              <summary>Не вошли в план · {plan.omitted.length}</summary>
              <div className="tms-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Перевозка</th>
                      <th>Заказчик</th>
                      <th>Причина</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.omitted.map(({ cargo: c, reason }) => (
                      <tr key={c.id}>
                        <td>{c.number}</td>
                        <td>{c.customer}</td>
                        <td>{reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          <p className="tms-muted">
            Это расчётный план. Отправка и назначения перевозок не изменяются.
          </p>
        </section>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
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
} from "./model";
import { planLoad, cargoProblem, validateOptions } from "./planner";
import "./tms.css";
const fmt = (n: number, d = 1) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: d });
const date = (s: string) => (s ? s.split("-").reverse().join(".") : "Нет даты");
const sum = (rows: TmsCargo[], key: "weight" | "volume" | "places") =>
  rows.reduce((s, c) => s + (c[key] ?? 0), 0);
const COLORS = [
  "#2563eb",
  "#059669",
  "#7c3aed",
  "#d97706",
  "#0891b2",
  "#db2777",
  "#4f46e5",
  "#65a30d",
];
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
  return (
    <details className="tms-multi">
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
export function LoadVisual({
  plan,
  vehicle,
}: {
  plan: LoadPlan;
  vehicle: Vehicle;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const index = new Map(plan.selected.map((c, i) => [c.id, i]));
  const selected = plan.selected.find((c) => c.id === hover);
  const longest = Math.max(...vehicle.compartments.map((c) => c.length));
  return (
    <div className="tms-visual">
      <div className="tms-section-heading">
        <h3>План загрузки · вид сверху</h3>
        <span>Передняя стенка → двери</span>
      </div>
      <p className="tms-muted">
        Палеты — по указанному размеру, остальной груз — зона по объёму на
        полную высоту кузова. Габариты отдельных мест, совместимость и нагрузку
        на оси проверяет логист.
      </p>
      {vehicle.compartments.map((c, i) => (
        <div key={i}>
          <div className="tms-visual-caption">
            {vehicle.compartments.length > 1 ? `Кузов ${i + 1} · ` : ""}
            {fmt(c.length, 2)} × {fmt(c.width, 2)} × {fmt(c.height, 2)} м
          </div>
          <svg
            role="img"
            aria-label={`План загрузки кузова ${i + 1}`}
            viewBox={`-0.12 -0.12 ${longest + 0.24} ${c.width + 0.24}`}
            style={{ maxHeight: 220 }}
          >
            <rect
              width={c.length}
              height={c.width}
              rx=".05"
              fill="var(--color-bg-secondary, #f1f5f9)"
              stroke="var(--color-text-secondary, #64748b)"
              strokeWidth=".025"
            />
            {plan.placements
              .filter((p) => p.compartment === i)
              .map((p, j) => {
                const idx = index.get(p.cargoId) ?? 0,
                  cargo = plan.selected[idx];
                return (
                  <g
                    key={j}
                    onMouseEnter={() => setHover(p.cargoId)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() =>
                      setHover(hover === p.cargoId ? null : p.cargoId)
                    }
                  >
                    <title>
                      {cargo.number} · {cargo.customer} · {fmt(cargo.weight!)}{" "}
                      кг · {fmt(cargo.volume!, 2)} м³
                    </title>
                    <rect
                      x={p.x + 0.012}
                      y={p.y + 0.012}
                      width={Math.max(0, p.length - 0.024)}
                      height={Math.max(0, p.width - 0.024)}
                      fill={COLORS[idx % COLORS.length]}
                      opacity={hover && hover !== p.cargoId ? 0.4 : 0.86}
                      rx=".02"
                    />
                    {p.length > 0.32 && (
                      <text
                        x={p.x + p.length / 2}
                        y={p.y + p.width / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="white"
                        fontSize=".18"
                      >
                        {idx + 1}
                      </text>
                    )}
                  </g>
                );
              })}
          </svg>
        </div>
      ))}
      <div className="tms-legend">
        {selected ? (
          <span>
            <b>№ {selected.number}</b> · {selected.customer} ·{" "}
            {fmt(selected.weight!)} кг · {fmt(selected.volume!, 2)} м³
          </span>
        ) : (
          <span>
            Наведите на груз для подробностей. Номера зон соответствуют списку
            ниже.
          </span>
        )}
      </div>
    </div>
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
  const [assigned, setAssigned] = useState(0),
    [progress, setProgress] = useState({ done: 0, total: 0 });
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
    setExcluded([]);
    setPriority([]);
    setFloorCustomers([]);
  }, [auth.login, auth.password]);
  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setLoading(true);
    setError("");
    setProgress({ done: 0, total: 0 });
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
        const numbers = [...new Set(data.items.map((c) => c.number))];
        setProgress({ done: 0, total: numbers.length });
        for (let i = 0; i < numbers.length; i += 4) {
          if (cancelled) break;
          const batch = numbers.slice(i, i + 4),
            result = await post(batch);
          if (cancelled) break;
          const byId = new Map(result.items.map((c) => [c.id, c]));
          setItems((current) =>
            current.map((c) =>
              batch.includes(c.number)
                ? (byId.get(c.id) ?? {
                    ...c,
                    readiness: "dispatched",
                    reason: "Уже включена в отправку или завершена",
                  })
                : c,
            ),
          );
          setProgress({
            done: Math.min(i + 4, numbers.length),
            total: numbers.length,
          });
          setCheckedAt(result.checkedAt);
        }
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
  const calculate = () => {
    try {
      if (from && to && from > to)
        throw new Error("Начало периода должно быть раньше конца");
      setPlan(planLoad(candidates, options));
      setPlanError("");
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Не удалось рассчитать");
    }
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
            ? `Проверка этапов в 1С: ${progress.done} из ${progress.total}…`
            : checkedAt
              ? `Проверено ${new Date(checkedAt).toLocaleString("ru-RU")}`
              : "Загрузка…"}
          {assigned > 0 && ` · Уже связаны с отправками: ${assigned}`}
        </div>
        {!ready.length && (
          <p className="tms-empty">
            {loading
              ? "Подтверждённые перевозки будут появляться здесь по мере проверки."
              : "Нет подтверждённых неотправленных перевозок по выбранным условиям."}
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
                            <span className="tms-muted">По объёму</span>
                          )}
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
            <summary>
              Не подтверждены для загрузки · {unresolved.length}
            </summary>
            <p className="tms-muted">
              Эти перевозки не участвуют в расчёте, пока нет подтверждения
              складской приёмки и отсутствия отправки.
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
            disabled={
              !candidates.length ||
              filtered.some((c) => c.readiness === "pending")
            }
            onClick={calculate}
          >
            <Package size={18} />
            Рассчитать
          </button>
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
          <LoadVisual plan={plan} vehicle={vehicle} />
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

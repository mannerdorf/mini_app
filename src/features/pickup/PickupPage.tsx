import { PickupRouteCheck } from "./PickupRouteCheck";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  Truck,
  Users,
  MapPin,
  Package,
  RefreshCw,
  Copy,
  Trash2,
} from "lucide-react";
import type { Account } from "../../types";
import {
  cities,
  plannedPlaces,
  routeWarnings,
  routeStartAddress,
  pickupJobCanCancel,
  pickupJobCanEdit,
  type City,
  type Snapshot,
  type Job,
  type Route,
  type Resource,
  type ResourceKind,
} from "../../../lib/pickup/model";
import {
  pickupJobCanDeleteInDispatchApp,
  pickupJobIsFinishedForCleanup,
  pickupRouteCanDeleteInDispatchApp,
} from "../../../lib/pickup/pickupCompletedRouteDeleteAccess";
import { pickupSiteInstructionsDisplay } from "../../../lib/pickup/jobSiteInstructions";
import {
  pickupClient,
  ApiError,
  cacheRead,
  cacheWrite,
  preparePhoto,
  type PickupCall,
} from "./client";
import {
  Field,
  Textarea,
  Select,
  ResourceForm,
  JobForm,
  RouteForm,
} from "./Forms";
import { PickupJobStatusBadge } from "./PickupJobStatusBadge";
import { PickupRouteStatusBadge } from "./PickupRouteStatusBadge";
import { PickupCancelJobSection } from "./PickupCancelJobSection";
import "../../styles/haulz-calculator.css";
import "./pickup.css";
import {
  attentionItems,
  movePendingStop,
  currentDriverJob,
  canDepositJobs,
} from "./operations";
import { PickupDriverGuide, PickupDriverStop } from "./PickupDriverGuide";
import { PickupDeposit } from "./PickupDeposit";
import { PickupMonitor } from "./PickupMonitor";
import { PickupDriverLocation } from "./PickupDriverLocation";
import { PickupStopOrder } from "./PickupStopOrder";
import { pickupProgress } from "./monitor";
import { PickupAttention } from "./PickupAttention";
import { PickupPublishReview } from "./PickupPublishReview";
import { PickupDispatcherJobStatusPanel } from "./PickupDispatcherJobStatusPanel";
import { PickupBulkAssign } from "./PickupBulkAssign";
import { PickupDayRow } from "./PickupDayRow";
import { matchesDayFilter, matchesDaySearch, type DayFilter } from "./dayPlan";
import { PickupBillingTab } from "./PickupBillingTab";
import { pickupJobOnBillingTab } from "../../../lib/pickup/pickupBillingJobs";

const empty: Snapshot = {
  resources: [],
  jobs: [],
  routes: [],
  events: [],
  dispatcher: false,
};
type Editor =
  | { type: "job"; job?: Job; copyFrom?: Job }
  | { type: "route"; route?: Route }
  | { type: ResourceKind; resource?: Resource }
  | null;
type Pending = { id: string; body: Record<string, unknown>; title: string };
const today = (city: City) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: city === "moscow" ? "Europe/Moscow" : "Europe/Kaliningrad",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const navUrl = (address: string) =>
  `https://yandex.ru/maps/?rtext=~${encodeURIComponent(address)}&rtt=auto`;

const PICKUP_JOB_VIEW_KEY = "haulz.pickup.jobView";
type PickupJobView = "detailed" | "compact";

function readPickupJobView(): PickupJobView {
  if (typeof window === "undefined") return "detailed";
  try {
    const v = localStorage.getItem(PICKUP_JOB_VIEW_KEY);
    return v === "compact" ? "compact" : "detailed";
  } catch {
    return "detailed";
  }
}

export function PickupPage({
  account,
  mode,
  onBack,
  hideBackNav = false,
}: {
  account: Account;
  mode: "dispatch" | "driver";
  onBack: () => void;
  /** Полноэкранный режим водителя/диспетчера без разделов ЛК — без кнопки «Назад». */
  hideBackNav?: boolean;
}) {
  const allowed =
    mode === "dispatch"
      ? account.permissions?.dispatcher === true
      : account.permissions?.driver === true;
  const call = useMemo(
    () => pickupClient(account),
    [account.login, account.password],
  );
  const [city, setCity] = useState<City>("moscow"),
    [date, setDate] = useState(today("moscow"));
  const [snapshot, setSnapshot] = useState<Snapshot>(empty),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [stale, setStale] = useState(false);
  const [tab, setTab] = useState("jobs"),
    [editor, setEditor] = useState<Editor>(null),
    [selected, setSelected] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [draggedStop, setDraggedStop] = useState<{
    id: string;
    routeId: string;
    version: number;
  } | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const [checkedJobs, setCheckedJobs] = useState<string[]>([]);
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [search, setSearch] = useState("");
  const [directorySearch, setDirectorySearch] = useState("");
  const [jobView, setJobView] = useState<PickupJobView>(readPickupJobView);
  const jobViewCompact = jobView === "compact";
  const setJobViewPersist = (next: PickupJobView) => {
    setJobView(next);
    try {
      localStorage.setItem(PICKUP_JOB_VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  };
  const [outbox, setOutbox] = useState<Pending[]>([]);
  const [outboxReady, setOutboxReady] = useState(false);
  const serial = useRef(0),
    lock = useRef(false);
  const key = `snapshot:${account.login.toLowerCase()}:${mode}:${city}:${date}`;
  const outboxKey = `outbox:${account.login.toLowerCase()}`;
  const dispatch = mode === "dispatch" && snapshot.dispatcher;
  const routeDeleteAllowed = useCallback(
    (status: Route["status"]) =>
      pickupRouteCanDeleteInDispatchApp(status, account.permissions),
    [account.permissions],
  );
  const jobDeleteAllowed = useCallback(
    (status: Job["status"]) =>
      pickupJobCanDeleteInDispatchApp(status, account.permissions),
    [account.permissions],
  );
  const refresh = useCallback(async () => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    const seq = ++serial.current;
    try {
      const result: Snapshot = await call({ action: "snapshot", city, date });
      if (seq !== serial.current) return;
      setSnapshot(result);
      setStale(false);
      setError("");
      if (mode === "driver")
        await cacheWrite(key, {
          ...result,
          dispatcher: false,
          resources: [],
          jobs: result.jobs.map((j) => ({
            ...j,
            data: {
              ...j.data,
              priceRub: undefined,
              payment: undefined,
              mkadKm: undefined,
            },
          })),
        }).catch(() => {});
    } catch (e) {
      if (seq !== serial.current) return;
      setError((e as Error).message);
      setStale(true);
      if (e instanceof ApiError && [401, 403].includes(e.status)) {
        setSnapshot(empty);
        await cacheWrite(key, undefined).catch(() => {});
      } else if (mode === "driver") {
        const cached = await cacheRead<Snapshot>(key).catch(() => undefined);
        if (seq === serial.current && cached) {
          setSnapshot(cached);
          setStale(true);
        }
      }
    } finally {
      if (seq === serial.current) setLoading(false);
    }
  }, [allowed, call, city, date, key, mode]);
  useEffect(() => {
    setSnapshot(empty);
    setEditor(null);
    setSelected("");
    setCheckedJobs([]);
    setSearch("");
    setDayFilter("all");
    setLoading(true);
    setStale(false);
    void refresh();
    const timer = window.setInterval(
      refresh,
      mode === "dispatch" ? 15000 : 30000,
    );
    return () => {
      ++serial.current;
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    setOutboxReady(false);
    let active = true;
    cacheRead<Pending[]>(outboxKey)
      .then((items) => {
        if (active) {
          setOutbox(items ?? []);
          setOutboxReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setOutboxReady(true);
          setError(
            "Локальное хранилище недоступно. Офлайн-отметки не будут сохранены.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [outboxKey]);
  const saveOutbox = async (items: Pending[]) => {
    await cacheWrite(outboxKey, items);
    setOutbox(items);
  };
  const sync = async () => {
    if (lock.current || !allowed || !outboxReady) return;
    lock.current = true;
    setBusy(true);
    let remaining = [...outbox];
    try {
      while (remaining.length) {
        await call(remaining[0].body);
        remaining = remaining.slice(1);
        await saveOutbox(remaining);
      }
      setNotice("Все отметки отправлены");
      await refresh();
    } catch (e) {
      setError(
        `${(e as Error).message} Отметки сохранены. При конфликте сначала обновите данные.`,
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    const online = () => void refresh();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [refresh]);
  const act = async (
    body: Record<string, unknown>,
    title: string,
    queueable = false,
  ) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const requestId = crypto.randomUUID(),
      command = { ...body, requestId };
    try {
      await call(command);
      setNotice(title);
      await refresh();
      return true;
    } catch (e) {
      if (queueable && (!(e instanceof ApiError) || e.status >= 500)) {
        try {
          await saveOutbox([
            ...outbox,
            { id: requestId, body: command, title },
          ]);
          setNotice(
            "Отметка сохранена на устройстве и ожидает отправки. Не выходите из аккаунта до синхронизации.",
          );
          return true;
        } catch {
          setError(
            "Не удалось сохранить отметку на устройстве. Повторите при наличии связи.",
          );
        }
      } else setError((e as Error).message);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const finishEditor = () => {
    setEditor(null);
    void refresh();
  };
  const routes =
    mode === "driver"
      ? snapshot.routes.filter(
          (r) =>
            r.status !== "draft" &&
            r.snapshot.driver?.data.login === account.login.toLowerCase(),
        )
      : snapshot.routes;
  const route =
    routes.find((r) => r.id === selected) ??
    (mode === "driver"
      ? (routes.find((r) => r.status === "started") ??
        routes.find((r) => r.status === "published"))
      : undefined) ??
    routes[0];
  const routeJobs = route
    ? snapshot.jobs
        .filter((j) => j.route_id === route.id && j.status !== "cancelled")
        .sort((a, b) => a.position - b.position)
    : [];
  const attention = attentionItems(snapshot.jobs, routes, city, now);
  const billingCount = snapshot.jobs.filter(pickupJobOnBillingTab).length;
  const currentStop = currentDriverJob(routeJobs);
  const activeJobs = snapshot.jobs.filter((j) => j.status !== "cancelled");
  const unassigned = activeJobs.filter((j) => !j.route_id);
  const routePending = route
    ? outbox.some(
        (p) =>
          p.body.id === route.id || routeJobs.some((j) => j.id === p.body.id),
      )
    : false;
  if (!allowed)
    return (
      <div className="pk-root">
        <button onClick={onBack}>Назад</button>
        <p role="alert">
          Нет доступа. Нужен бейдж «
          {mode === "dispatch" ? "Диспетчер" : "Водитель"}».
        </p>
      </div>
    );
  return (
    <div className={`pk-root ${mode === "driver" ? "pk-driver-root" : ""}`}>
      <header className="pk-header">
        {hideBackNav ? (
          <span className="pk-header-spacer" aria-hidden />
        ) : (
          <button onClick={onBack} aria-label="Назад в Холз">
            <ArrowLeft size={20} />
          </button>
        )}
        <div>
          <p className="pk-eyebrow">ХОЛЗ / ЗАБОРНАЯ ЛОГИСТИКА</p>
          <h1>{mode === "dispatch" ? "Диспетчеризация" : "Мой маршрут"}</h1>
        </div>
        <button
          disabled={busy}
          onClick={() => void refresh()}
          aria-label="Обновить"
        >
          <RefreshCw size={18} />
        </button>
      </header>
      <DayControls
        driver={mode === "driver"}
        label={`${cities[city]} · ${date}`}
      >
        <div className="pk-toolbar">
          <Select
            label="Город"
            value={city}
            onChange={(v) => {
              setCity(v as City);
              setDate(today(v as City));
            }}
            options={Object.entries(cities).map(([id, name]) => ({ id, name }))}
          />
          <Field label="Дата" type="date" value={date} onChange={setDate} />
          {dispatch && (
            <div className="pk-actions">
              <button
                className="pk-primary"
                onClick={() => setEditor({ type: "job" })}
              >
                + Забор
              </button>
              <button onClick={() => setEditor({ type: "route" })}>
                + Маршрут
              </button>
            </div>
          )}
        </div>
      </DayControls>
      {error && (
        <p className="pk-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="pk-notice" role="status">
          {notice}
        </p>
      )}
      {stale && (
        <p className="pk-warning">
          Сохранённая копия маршрута. Статусы могут быть неактуальны.
        </p>
      )}
      {!!outbox.length && (
        <section className="pk-panel">
          <h3>Ожидают отправки: {outbox.length}</h3>
          <p>
            Сначала отправьте сохранённые отметки. Остальные действия по этому
            маршруту временно недоступны.
          </p>
          <button disabled={busy} onClick={() => void sync()}>
            Отправить отметки
          </button>
          {outbox.map((p) => (
            <div className="pk-actions" key={p.id}>
              <span>{p.title}</span>
              <ConfirmButton
                disabled={busy}
                iconLabel="Удалить локальную отметку"
                prompt="Удалить только локальную отметку? Затем проверьте серверный статус."
                confirmLabel="Подтвердить удаление"
                onConfirm={async () => {
                  try {
                    await saveOutbox(outbox.filter((x) => x.id !== p.id));
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Trash2 size={16} aria-hidden />
              </ConfirmButton>
            </div>
          ))}
        </section>
      )}
      {loading && <p role="status">Загрузка маршрутов…</p>}
      {editor && dispatch && (
        <div className="pk-editor-overlay" role="dialog" aria-modal="true">
          {editor.type === "job" ? (
            <JobForm
              job={editor.job}
              copyFrom={editor.copyFrom}
              city={city}
              date={date}
              call={call}
              account={account}
              done={finishEditor}
              onCreatedMany={(n) =>
                setNotice(`Создано заборов по графику: ${n}`)
              }
            />
          ) : editor.type === "route" ? (
            <RouteForm
              route={editor.route}
              city={city}
              date={date}
              resources={snapshot.resources}
              call={call}
              done={finishEditor}
            />
          ) : (
            <ResourceForm
              kind={editor.type}
              resource={editor.resource}
              city={city}
              call={call}
              done={finishEditor}
            />
          )}
        </div>
      )}
      {dispatch && (
        <>
          <div className="pk-stats" aria-label="Фильтры плана дня">
            {(
              [
                ["all", "Заборов за день", "blue"],
                ["unassigned", "Не распределено", "amber"],
                ["collected", "Груз забран", "green"],
                ["attention", "Требуют решения", "red"],
              ] as const
            ).map(([id, label, tone]) => (
              <button
                key={id}
                type="button"
                className={`pk-stat pk-stat--${tone}`}
                aria-pressed={tab === "jobs" && dayFilter === id}
                onClick={() => {
                  setTab("jobs");
                  setDayFilter(id);
                  setSearch("");
                }}
              >
                <strong>
                  {snapshot.jobs.filter((j) => matchesDayFilter(j, id)).length}
                </strong>
                <span>{label}</span>
              </button>
            ))}
          </div>
          <nav className="pk-tabs" aria-label="Разделы диспетчеризации">
            {[
              ["jobs", "План дня"],
              ["routes", "Маршруты"],
              ["billing", `Выставление счетов · ${billingCount}`],
              ["monitor", "Монитор рейсов"],
              ["attention", `Внимание · ${attention.length}`],
              ["directories", "Справочники"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={
                  tab === id ||
                  (id === "directories" && ["driver", "vehicle"].includes(tab))
                    ? "pk-selected"
                    : ""
                }
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {(tab === "jobs" || tab === "routes") && (
            <div
              className="pk-view-toggle haulz-calc-segment"
              role="group"
              aria-label="Вид карточек заборов"
            >
              <button
                type="button"
                className={`haulz-calc-segment__btn${!jobViewCompact ? " haulz-calc-segment__btn--active" : ""}`}
                aria-pressed={!jobViewCompact}
                onClick={() => setJobViewPersist("detailed")}
              >
                Подробно
              </button>
              <button
                type="button"
                className={`haulz-calc-segment__btn${jobViewCompact ? " haulz-calc-segment__btn--active" : ""}`}
                aria-pressed={jobViewCompact}
                onClick={() => setJobViewPersist("compact")}
              >
                Сжатый
              </button>
            </div>
          )}
        </>
      )}
      {loading ? null : dispatch && tab === "monitor" ? (
        <PickupMonitor
          snapshot={snapshot}
          now={now}
          stale={stale}
          onRoute={(r) => {
            setTab("routes");
            setSelected(r.id);
          }}
        />
      ) : dispatch && tab === "billing" ? (
        <PickupBillingTab
          city={city}
          date={date}
          jobs={snapshot.jobs}
          routes={routes}
        />
      ) : dispatch && tab === "attention" ? (
        <PickupAttention
          onRepeat={(job) => setEditor({ type: "job", copyFrom: job })}
          items={attention}
          onJob={(j) => {
            if (pickupJobCanEdit(j.status)) setEditor({ type: "job", job: j });
            else {
              setTab("routes");
              setSelected(j.route_id ?? "");
            }
          }}
          onRoute={(r) => {
            setTab("routes");
            setSelected(r.id);
          }}
          renderResolution={(j) => <Resolution job={j} busy={busy} act={act} />}
        />
      ) : dispatch && tab === "directories" ? (
        <section className="pk-panel">
          <h2>Справочники</h2>
          <p className="pk-hint">
            Водители и автомобили города {cities[city]}. Данные используются при
            назначении маршрутов.
          </p>
          <div className="pk-directory-links">
            <button
              onClick={() => {
                setDirectorySearch("");
                setTab("driver");
              }}
            >
              <Users size={26} />
              <strong>Водители</strong>
              <span>
                {snapshot.resources.filter((r) => r.kind === "driver").length}{" "}
                записей · ФИО, телефоны, доступность
              </span>
            </button>
            <button
              onClick={() => {
                setDirectorySearch("");
                setTab("vehicle");
              }}
            >
              <Truck size={26} />
              <strong>Автомобили</strong>
              <span>
                {snapshot.resources.filter((r) => r.kind === "vehicle").length}{" "}
                записей · Госномер, тип, вместимость
              </span>
            </button>
          </div>
        </section>
      ) : dispatch && (tab === "driver" || tab === "vehicle") ? (
        <section className="pk-panel">
          <div className="pk-actions">
            <h2>Справочник: {tab === "driver" ? "водители" : "автомобили"}</h2>
            <button onClick={() => setEditor({ type: tab as ResourceKind })}>
              + Добавить
            </button>
          </div>
          <button
            type="button"
            className="pk-link-btn"
            onClick={() => setTab("directories")}
          >
            ← Все справочники
          </button>
          <Field
            label="Поиск в справочнике"
            value={directorySearch}
            onChange={setDirectorySearch}
            placeholder="ФИО, телефон или госномер"
          />
          <div className="pk-resource-grid">
            {snapshot.resources
              .filter(
                (r) =>
                  r.kind === tab && r.active &&
                  [r.name, ...Object.values(r.data)]
                    .join(" ")
                    .toLocaleLowerCase("ru")
                    .includes(directorySearch.trim().toLocaleLowerCase("ru")),
              )
              .map((r) => (
                <article className="pk-card" key={r.id}>
                  <h3>{r.name}</h3>
                  <p>
                    {r.active
                      ? "Доступен для назначения"
                      : "Недоступен / архив"}{" "}
                    ·{" "}
                    {r.data.type === "hired"
                      ? "Наёмный"
                      : r.data.type === "own"
                        ? "Собственный"
                        : ""}
                  </p>
                  <p>{r.data.phone || r.data.plate || r.data.address}</p>
                  {r.kind === "depot" && r.data.from && r.data.to ? (
                    <p>
                      {r.data.from}–{r.data.to}
                    </p>
                  ) : null}
                  <p className="pk-muted">{r.data.login || r.data.model}</p>
                  <div className="pk-resource-workload">
                    <strong>Рейсы на {date}</strong>
                    {(() => {
                      const assigned = routes.filter(
                        (route) =>
                          (r.kind === "driver"
                            ? route.driver_id
                            : route.vehicle_id) === r.id,
                      );
                      const started = assigned.some(
                        (route) => route.status === "started",
                      );
                      return (
                        <>
                          <p
                            className={`pk-resource-state ${started ? "pk-resource-state--busy" : ""}`}
                          >
                            {started
                              ? "В рейсе"
                              : assigned.some((route) =>
                                    ["draft", "published"].includes(
                                      route.status,
                                    ),
                                  )
                                ? "Есть запланированные рейсы"
                                : "Нет активных рейсов на эту дату"}
                          </p>
                          {assigned.map((route) => (
                            <button
                              key={route.id}
                              className="pk-link-btn"
                              onClick={() => {
                                setSelected(route.id);
                                setTab("routes");
                              }}
                            >
                              {route.start_time} · {route.name} ·{" "}
                              <PickupRouteStatusBadge status={route.status} />
                            </button>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                  <div className="pk-actions">
                    <button
                      type="button"
                      onClick={() => setEditor({ type: r.kind, resource: r })}
                    >
                      Изменить
                    </button>
                    <DeleteResourceButton
                      resource={r}
                      busy={busy}
                      act={act}
                    />
                  </div>
                </article>
              ))}
          </div>
          {!snapshot.resources.some((r) => r.kind === tab && r.active) && (
            <p className="pk-empty">
              Добавьте первую запись для города {cities[city]}.
            </p>
          )}
        </section>
      ) : dispatch && tab === "jobs" ? (
        <section className="pk-panel">
          <h2>
            План дня ·{" "}
            {new Intl.DateTimeFormat("ru-RU", {
              day: "numeric",
              month: "long",
            }).format(new Date(date + "T12:00:00"))}
          </h2>
          <div className="pk-day-filters">
            <Field
              label="Поиск заборов"
              value={search}
              onChange={setSearch}
              placeholder="Адрес, заказчик, отправитель, № заявки, водитель"
            />
            <Select
              label="Показать"
              value={dayFilter}
              onChange={(v) => setDayFilter(v as DayFilter)}
              options={[
                { id: "all", name: "Все активные" },
                { id: "unassigned", name: "Не распределено" },
                { id: "collected", name: "Груз забран" },
                { id: "attention", name: "Требуют решения" },
                { id: "cancelled", name: "Отменённые" },
              ]}
            />
          </div>
          <p className="pk-hint" role="status">
            Найдено:{" "}
            {
              snapshot.jobs.filter(
                (j) =>
                  matchesDayFilter(j, dayFilter) &&
                  matchesDaySearch(j, search, routes),
              ).length
            }
            . Нажмите на строку, чтобы открыть подробности.
          </p>
          {(search || dayFilter !== "all") && (
            <button
              className="pk-link-btn"
              onClick={() => {
                setSearch("");
                setDayFilter("all");
              }}
            >
              Сбросить фильтры
            </button>
          )}
          <div className="pk-actions pk-selection-tools">
            <button
              onClick={() =>
                setCheckedJobs(
                  snapshot.jobs
                    .filter(
                      (j) =>
                        !j.route_id &&
                        j.status === "pending" &&
                        matchesDayFilter(j, dayFilter) &&
                        matchesDaySearch(j, search, routes),
                    )
                    .map((j) => j.id),
                )
              }
            >
              Выбрать все неназначенные в списке
            </button>
            <span className="pk-hint">
              Для назначения отметьте заборы слева.
            </span>
          </div>
          {!!snapshot.jobs.filter(
            (j) =>
              checkedJobs.includes(j.id) &&
              !j.route_id &&
              j.status === "pending",
          ).length && (
            <PickupBulkAssign
              jobs={snapshot.jobs.filter(
                (j) =>
                  checkedJobs.includes(j.id) &&
                  !j.route_id &&
                  j.status === "pending",
              )}
              allJobs={snapshot.jobs}
              routes={routes}
              resources={snapshot.resources}
              call={call}
              clear={() => setCheckedJobs([])}
              done={(count) => {
                setCheckedJobs([]);
                setNotice(`Назначено заборов: ${count}`);
                void refresh();
              }}
            />
          )}
          <div className="pk-day-columns" aria-hidden="true">
            <span>Окно забора</span>
            <span>Отправитель / адрес</span>
            <span>Груз</span>
            <span>Водитель / маршрут</span>
            <span>Статус</span>
            <span />
          </div>
          {snapshot.jobs
            .filter(
              (j) =>
                matchesDayFilter(j, dayFilter) &&
                matchesDaySearch(j, search, routes),
            )
            .map((j) => (
              <PickupDayRow
                key={j.id}
                job={j}
                route={routes.find((r) => r.id === j.route_id)}
                closeWhen={Boolean(editor)}
                checked={checkedJobs.includes(j.id)}
                onCheck={(value) =>
                  setCheckedJobs((ids) =>
                    value
                      ? [...new Set([...ids, j.id])]
                      : ids.filter((id) => id !== j.id),
                  )
                }
              >
                <article
                  className={`pk-card pk-card--${j.status}${jobViewCompact ? " pk-card--compact" : ""}`}
                >
                  <JobDetails
                    job={j}
                    call={call}
                    driver={false}
                    dispatcher={true}
                    compact={jobViewCompact}
                    canAct={false}
                    canCancel={false}
                    busy={busy}
                    act={act}
                  />

                  <div className="pk-actions">
                    <button
                      type="button"
                      className="pk-icon-btn"
                      aria-label="Копировать забор"
                      title="Копировать забор"
                      onClick={() => setEditor({ type: "job", copyFrom: j })}
                    >
                      <Copy size={16} aria-hidden />
                    </button>
                    {pickupJobCanEdit(j.status) && (
                      <button
                        type="button"
                        onClick={() => setEditor({ type: "job", job: j })}
                      >
                        Изменить
                      </button>
                    )}
                    {jobDeleteAllowed(j.status) && (
                      <DeleteJobButton job={j} busy={busy} act={act} compact />
                    )}
                    <span>
                      {snapshot.routes.find((r) => r.id === j.route_id)?.name ??
                        "Не распределён"}
                    </span>
                  </div>
                  {dispatch && pickupJobCanCancel(j.status) && (
                    <PickupCancelJobSection
                      job={j}
                      busy={busy}
                      compact
                      onConfirm={(note) =>
                        act(
                          {
                            action: "cancel",
                            id: j.id,
                            version: j.version,
                            note,
                          },
                          "Забор отменён",
                        )
                      }
                    />
                  )}
                  {j.status === "cancelled" && j.resolution && (
                    <p className="pk-muted pk-cancel-reason">{j.resolution}</p>
                  )}
                </article>
              </PickupDayRow>
            ))}
        </section>
      ) : (
        <div
          className={`pk-workspace ${!dispatch ? "pk-driver-workspace" : ""}`}
        >
          {(dispatch || routes.length > 1) && (
            <aside className="pk-panel">
              <h2>
                <Truck size={20} /> Маршруты · {routes.length}
              </h2>
              {routes.map((r) => (
                <div
                  key={r.id}
                  className={`pk-route-row ${route?.id === r.id ? "pk-selected" : ""}`}
                >
                  <button
                    type="button"
                    className="pk-route-tile"
                    onClick={() => setSelected(r.id)}
                  >
                    <strong>{r.name}</strong>
                    <span className="pk-route-tile__meta">
                      {r.start_time} ·{" "}
                      <PickupRouteStatusBadge status={r.status} />
                    </span>
                    <span>{r.snapshot.driver?.name}</span>
                    <span>{r.snapshot.vehicle?.data.plate}</span>
                    <span>
                      Груз забран:{" "}
                      {
                        pickupProgress(
                          snapshot.jobs.filter((j) => j.route_id === r.id),
                        ).collected
                      }{" "}
                      из{" "}
                      {
                        pickupProgress(
                          snapshot.jobs.filter((j) => j.route_id === r.id),
                        ).total
                      }
                    </span>
                  </button>
                  {dispatch && routeDeleteAllowed(r.status) && (
                    <DeleteRouteButton
                      route={r}
                      busy={busy}
                      act={act}
                      compact
                      onDone={() => {
                        if (route?.id === r.id) setSelected("");
                      }}
                    />
                  )}
                </div>
              ))}
              {!routes.length && (
                <p className="pk-empty">
                  {dispatch
                    ? "Создайте маршрут и назначьте заборы."
                    : "На эту дату маршрутов нет. Проверьте город или обратитесь к диспетчеру."}
                </p>
              )}
              {dispatch && (
                <>
                  <h2>
                    <Package size={20} /> Не распределено · {unassigned.length}
                  </h2>
                  {unassigned.map((j) => (
                    <article
                      className={`pk-card pk-card--${j.status}${jobViewCompact ? " pk-card--compact" : ""}`}
                      key={j.id}
                    >
                      <div className="pk-card__head">
                        <PickupJobStatusBadge status={j.status} />
                      </div>
                      <JobSummary job={j} compact={jobViewCompact} />
                      <div className="pk-actions">
                        <button
                          type="button"
                          className="pk-icon-btn"
                          aria-label="Копировать забор"
                          title="Копировать забор"
                          onClick={() =>
                            setEditor({ type: "job", copyFrom: j })
                          }
                        >
                          <Copy size={16} aria-hidden />
                        </button>
                        {pickupJobCanEdit(j.status) && (
                          <button
                            type="button"
                            onClick={() => setEditor({ type: "job", job: j })}
                          >
                            Изменить
                          </button>
                        )}
                        {jobDeleteAllowed(j.status) && (
                          <DeleteJobButton
                            job={j}
                            busy={busy}
                            act={act}
                            compact
                          />
                        )}
                        {route && route.status !== "completed" && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void act(
                                {
                                  action: "assign",
                                  id: j.id,
                                  version: j.version,
                                  route_id: route.id,
                                },
                                "Забор добавлен в маршрут",
                              )
                            }
                          >
                            В «{route.name}» →
                          </button>
                        )}
                      </div>
                      {dispatch && (
                        <PickupCancelJobSection
                          job={j}
                          busy={busy}
                          compact
                          onConfirm={(note) =>
                            act(
                              {
                                action: "cancel",
                                id: j.id,
                                version: j.version,
                                note,
                              },
                              "Забор отменён",
                            )
                          }
                        />
                      )}
                    </article>
                  ))}
                </>
              )}
            </aside>
          )}
          <main className="pk-panel">
            {route ? (
              <>
                <div className="pk-route-heading">
                  <div>
                    <p className="pk-eyebrow">
                      {cities[city]} · {route.date}
                    </p>
                    <h2>{route.name}</h2>
                    <p className="pk-hint">Место старта: {routeStartAddress(route) || "Склад HAULZ"} · {route.start_time}</p>
                    <p className="pk-route-meta">
                      <PickupRouteStatusBadge status={route.status} /> ·{" "}
                      {route.snapshot.driver?.name} ·{" "}
                      {route.snapshot.vehicle?.data.plate}
                    </p>
                  </div>
                  <span className="pk-badge pk-badge--progress">
                    Обработано:
                    {
                      routeJobs.filter((j) =>
                        [
                          "picked_up",
                          "partial",
                          "deposited",
                          "resolved",
                        ].includes(j.status),
                      ).length
                    }{" "}
                    / {routeJobs.length}
                  </span>
                </div>
                {dispatch && route.status !== "completed" && (
                  <PickupRouteCheck
                    key={route.id}
                    route={route}
                    jobs={routeJobs}
                    snapshot={snapshot}
                    call={call}
                    busy={busy}
                    stale={stale}
                    onApply={(result) =>
                      act(
                        {
                          action: "reorder",
                          id: route.id,
                          version: result.routeVersion,
                          ids: result.ids,
                          analysisSignature: result.signature,
                          checkedAt: result.checkedAt,
                        },
                        "Предложенный порядок применён",
                      )
                    }
                  />
                )}
                {mode === "driver" && (
                  <PickupDriverGuide
                    route={route}
                    jobs={routeJobs}
                    queued={routePending}
                    stale={stale}
                  />
                )}
                {dispatch &&
                  routeWarnings(routeJobs, route.snapshot.vehicle).map((w) => (
                    <p key={w} className="pk-warning">
                      {w}
                    </p>
                  ))}
                {dispatch && (
                  <p className="pk-muted">
                    План:{" "}
                    {routeJobs.reduce((s, j) => s + plannedPlaces(j.data), 0)}{" "}
                    мест ·{" "}
                    {routeJobs
                      .reduce((s, j) => s + (j.data.weightKg ?? 0), 0)
                      .toFixed(1)}{" "}
                    кг ·{" "}
                    {routeJobs
                      .reduce((s, j) => s + (j.data.volumeM3 ?? 0), 0)
                      .toFixed(2)}{" "}
                    м³. Для оценки времени, окон и проезда нажмите «Проверить
                    маршрут».
                  </p>
                )}
                {route.status !== "draft" &&
                  route.status !== "completed" &&
                  route.acknowledged_version !== route.version && (
                    <div className="pk-warning">
                      <strong>
                        {dispatch
                          ? "Ожидает подтверждения водителя"
                          : route.status === "published"
                            ? "Проверьте маршрут перед стартом"
                            : "Диспетчер изменил маршрут"}
                      </strong>
                      <p>
                        Версия {route.version}. Проверьте состав и порядок
                        остановок.
                      </p>
                      <details>
                        <summary>Последние изменения</summary>
                        {snapshot.events
                          .filter((e) => e.route_id === route.id)
                          .slice(0, 3)
                          .map((e) => (
                            <p key={e.id} className="pk-hint">
                              {e.action} ·{" "}
                              {new Date(e.created_at).toLocaleTimeString(
                                "ru-RU",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone:
                                    city === "moscow"
                                      ? "Europe/Moscow"
                                      : "Europe/Kaliningrad",
                                },
                              )}
                            </p>
                          ))}
                      </details>
                      {mode === "driver" && route.status === "started" && (
                        <button
                          disabled={busy || routePending}
                          onClick={() =>
                            void act(
                              {
                                action: "acknowledge",
                                id: route.id,
                                version: route.version,
                              },
                              "Изменения просмотрены",
                            )
                          }
                        >
                          Ознакомился с маршрутом
                        </button>
                      )}
                    </div>
                  )}
                {dispatch && route.status === "draft" && (
                  <div className="pk-route-draft-bar">
                    <p className="pk-muted">
                      Черновик маршрута — можно изменить, удалить или
                      опубликовать водителю.
                    </p>
                    <div className="pk-actions">
                      <button
                        type="button"
                        onClick={() => setEditor({ type: "route", route })}
                      >
                        Параметры
                      </button>
                      <DeleteRouteButton
                        route={route}
                        busy={busy}
                        act={act}
                        onDone={() => setSelected("")}
                      />
                      <PickupPublishReview
                        route={route}
                        jobs={routeJobs}
                        resources={snapshot.resources}
                        busy={busy}
                        error={error}
                        onPublish={() =>
                          act(
                            {
                              action: "publish",
                              id: route.id,
                              version: route.version,
                            },
                            "Маршрут опубликован водителю",
                          )
                        }
                      />
                    </div>
                  </div>
                )}
                {dispatch && route.status === "completed" && routeDeleteAllowed("completed") && (
                  <div className="pk-route-draft-bar">
                    <p className="pk-muted">
                      Маршрут завершён. Можно удалить запись маршрута — заборы
                      останутся в журнале дня без привязки к рейсу.
                    </p>
                    <div className="pk-actions">
                      <DeleteRouteButton
                        route={route}
                        busy={busy}
                        act={act}
                        onDone={() => setSelected("")}
                      />
                    </div>
                  </div>
                )}
                {dispatch && route.status === "published" && (
                  <div className="pk-route-draft-bar">
                    <p className="pk-muted">
                      Маршрут опубликован, но ещё не начат. Можно удалить
                      (заборы вернутся в «Не распределено») или изменить
                      параметры.
                    </p>
                    <div className="pk-actions">
                      <button
                        type="button"
                        onClick={() => setEditor({ type: "route", route })}
                      >
                        Параметры
                      </button>
                      <DeleteRouteButton
                        route={route}
                        busy={busy}
                        act={act}
                        onDone={() => setSelected("")}
                      />
                    </div>
                  </div>
                )}
                {dispatch && route.status === "started" && (
                  <div className="pk-route-draft-bar">
                    <p className="pk-muted">
                      Рейс выполняется. Пока все точки в статусе «Ожидает
                      забора», можно изменить параметры или удалить маршрут
                      (заборы вернутся в «Не распределено»).
                    </p>
                    <div className="pk-actions">
                      <button
                        type="button"
                        onClick={() => setEditor({ type: "route", route })}
                      >
                        Параметры
                      </button>
                      <DeleteRouteButton
                        route={route}
                        busy={busy}
                        act={act}
                        onDone={() => setSelected("")}
                      />
                    </div>
                  </div>
                )}
                <div className="pk-actions">
                  {mode === "driver" && route.status === "published" && (
                    <button
                      className="pk-primary"
                      disabled={busy || routePending || !outboxReady}
                      onClick={() =>
                        void act(
                          {
                            action: "start",
                            id: route.id,
                            version: route.version,
                          },
                          "Приступил к выполнению",
                          true,
                        )
                      }
                    >
                      Маршрут проверен — начать
                    </button>
                  )}
                </div>
                {mode === "driver" && route.status === "started" && (
                  <PickupDriverLocation
                    key={route.id}
                    routeId={route.id}
                    available={snapshot.locationAvailable === true}
                    call={call}
                  />
                )}
                {mode === "driver" && route.status !== "completed" && (
                  <div className="pk-driver-order-action">
                    <PickupStopOrder
                      key={route.id}
                      route={route}
                      jobs={routeJobs}
                      busy={busy}
                      error={error}
                      disabled={
                        busy ||
                        stale ||
                        routePending ||
                        !outboxReady ||
                        (route.status === "started" &&
                          route.acknowledged_version !== route.version)
                      }
                      onSave={(ids, version) =>
                        act(
                          {
                            action: "reorder",
                            id: route.id,
                            version,
                            ids,
                            asDriver: true,
                          },
                          "Новый порядок точек сохранён и передан диспетчеру",
                        )
                      }
                    />
                  </div>
                )}
                <RouteMap jobs={routeJobs} />
                {dispatch && route.status !== "completed" && (
                  <p className="pk-hint">
                    Перетаскивайте за ручку ⠿ или используйте «Выше / Ниже».
                    Начатые точки остаются на своих местах.
                  </p>
                )}
                <ol className="pk-stops">
                  {routeJobs.map((j, i) => (
                    <li
                      key={j.id}
                      className={
                        draggedStop &&
                        movePendingStop(routeJobs, draggedStop.id, j.id)
                          ? "pk-drop-target"
                          : ""
                      }
                      onDragOver={(e) => {
                        if (
                          dispatch &&
                          draggedStop &&
                          movePendingStop(routeJobs, draggedStop.id, j.id)
                        )
                          e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!draggedStop) return;
                        const ids = movePendingStop(
                          routeJobs,
                          draggedStop.id,
                          j.id,
                        );
                        if (
                          ids &&
                          route.id === draggedStop.routeId &&
                          route.version === draggedStop.version &&
                          !busy
                        )
                          void act(
                            {
                              action: "reorder",
                              id: route.id,
                              version: route.version,
                              ids,
                            },
                            "Порядок изменён",
                          );
                        else
                          setError(
                            "Маршрут изменился или точка зафиксирована. Проверьте порядок.",
                          );
                        setDraggedStop(null);
                      }}
                    >
                      <div className="pk-stop-handle">
                        <div className="pk-stop-number">{i + 1}</div>
                        {dispatch &&
                          route.status !== "completed" &&
                          j.status === "pending" && (
                            <button
                              type="button"
                              draggable={!busy}
                              disabled={busy}
                              aria-label={`Перетащить точку ${i + 1}`}
                              onDragStart={(e) => {
                                setDraggedStop({
                                  id: j.id,
                                  routeId: route.id,
                                  version: route.version,
                                });
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", j.id);
                              }}
                              onDragEnd={() => setDraggedStop(null)}
                            >
                              ⠿
                            </button>
                          )}
                      </div>
                      <div className="pk-stop-content">
                        <DriverPointWrapper
                          driver={mode === "driver"}
                          job={j}
                          current={j.id === currentStop?.id}
                          index={i}
                        >
                          <JobDetails
                            key={j.id}
                            job={j}
                            call={call}
                            driver={mode === "driver"}
                            dispatcher={dispatch}
                            compact={dispatch && jobViewCompact}
                            canAct={
                              mode === "driver" &&
                              route.status === "started" &&
                              !routePending &&
                              outboxReady &&
                              route.acknowledged_version === route.version
                            }
                            canCancel={
                              pickupJobCanCancel(j.status) &&
                              !routePending &&
                              outboxReady &&
                              (dispatch ||
                                (mode === "driver" &&
                                  route.status !== "completed" &&
                                  route.status !== "draft" &&
                                  (route.status === "published" ||
                                    (route.status === "started" &&
                                      route.acknowledged_version ===
                                        route.version))))
                            }
                            busy={busy}
                            act={act}
                          />
                        </DriverPointWrapper>
                        {dispatch && route.status !== "completed" && (
                          <div className="pk-actions">
                            {pickupJobCanEdit(j.status) && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  setEditor({ type: "job", job: j })
                                }
                              >
                                Изменить
                              </button>
                            )}
                            {jobDeleteAllowed(j.status) && (
                              <DeleteJobButton
                                job={j}
                                busy={busy}
                                act={act}
                                compact
                              />
                            )}
                            {j.status === "pending" && (
                              <>
                                <button
                                  disabled={
                                    busy ||
                                    i === 0 ||
                                    routeJobs[i - 1]?.status !== "pending"
                                  }
                                  onClick={() => {
                                    const ids = routeJobs.map((x) => x.id);
                                    [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                                    void act(
                                      {
                                        action: "reorder",
                                        id: route.id,
                                        version: route.version,
                                        ids,
                                      },
                                      "Порядок изменён",
                                    );
                                  }}
                                >
                                  ↑ Выше
                                </button>
                                <button
                                  disabled={
                                    busy ||
                                    i === routeJobs.length - 1 ||
                                    routeJobs[i + 1]?.status !== "pending"
                                  }
                                  onClick={() => {
                                    const ids = routeJobs.map((x) => x.id);
                                    [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
                                    void act(
                                      {
                                        action: "reorder",
                                        id: route.id,
                                        version: route.version,
                                        ids,
                                      },
                                      "Порядок изменён",
                                    );
                                  }}
                                >
                                  ↓ Ниже
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void act(
                                      {
                                        action: "assign",
                                        id: j.id,
                                        version: j.version,
                                        route_id: null,
                                      },
                                      "Забор возвращён в нераспределённые",
                                    )
                                  }
                                >
                                  Снять с маршрута
                                </button>
                              </>
                            )}
                            {["problem", "partial"].includes(j.status) &&
                              !j.resolution && (
                                <Resolution job={j} busy={busy} act={act} />
                              )}
                            {["published", "started", "completed"].includes(
                              route.status,
                            ) && (
                              <PickupDispatcherJobStatusPanel
                                key={`${j.id}-${j.version}`}
                                job={j}
                                busy={busy}
                                act={act}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
                <section className="pk-depot">
                  <MapPin size={24} />
                  <div>
                    <p className="pk-eyebrow">КОНЕЧНАЯ ТОЧКА</p>
                    <h3>{route.snapshot.depot?.name}</h3>
                    <p>{route.snapshot.depot?.data.address}</p>
                    <p>
                      Приёмка: {route.snapshot.depot?.data.from}–
                      {route.snapshot.depot?.data.to}
                    </p>
                    <p>{route.snapshot.depot?.data.note}</p>
                    <a
                      href={navUrl(route.snapshot.depot?.data.address ?? "")}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Навигация до склада ↗
                    </a>
                    {mode === "driver" && route.status === "started" && (
                      <p className="pk-hint">
                        {canDepositJobs(routeJobs)
                          ? "После передачи всех забранных грузов подтвердите сдачу."
                          : "Сначала завершите заборы и дождитесь решений по проблемам."}
                      </p>
                    )}
                    {mode === "driver" && route.status === "started" && (
                      <PickupDeposit
                        key={route.id}
                        jobs={routeJobs}
                        busy={busy}
                        error={error}
                        disabled={
                          busy ||
                          routePending ||
                          !outboxReady ||
                          !canDepositJobs(routeJobs)
                        }
                        onConfirm={(numbers) =>
                          act(
                            {
                              action: "deposit",
                              id: route.id,
                              version: route.version,
                              zayavka_numbers: numbers,
                            },
                            "Грузы сданы на склад",
                            true,
                          )
                        }
                      />
                    )}
                  </div>
                </section>
                <details className="pk-history">
                  <summary>История маршрута</summary>
                  {snapshot.events
                    .filter((e) => e.route_id === route.id)
                    .map((e) => (
                      <p key={e.id}>
                        <strong>{e.action}</strong> ·{" "}
                        {new Date(e.created_at).toLocaleString("ru-RU", {
                          timeZone:
                            city === "moscow"
                              ? "Europe/Moscow"
                              : "Europe/Kaliningrad",
                        })}{" "}
                        · {e.actor}
                        {e.data.note ? ` — ${e.data.note}` : ""}
                      </p>
                    ))}
                </details>
              </>
            ) : (
              <p className="pk-empty">
                {mode === "driver"
                  ? "На выбранный день маршрутов нет. Проверьте город и дату или обратитесь к диспетчеру."
                  : "Выберите маршрут"}
              </p>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
function DayControls({
  driver,
  label,
  children,
}: {
  driver: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return driver ? (
    <details className="pk-day-controls">
      <summary>
        {label}
        <span>Сменить день / город</span>
      </summary>
      {children}
    </details>
  ) : (
    <>{children}</>
  );
}
function DriverPointWrapper({
  driver,
  job,
  current,
  index,
  children,
}: {
  driver: boolean;
  job: Job;
  current: boolean;
  index: number;
  children: React.ReactNode;
}) {
  return driver ? (
    <PickupDriverStop job={job} current={current} index={index}>
      {children}
    </PickupDriverStop>
  ) : (
    <>{children}</>
  );
}
function JobSummary({
  job,
  showBadge = false,
  compact = false,
}: {
  job: Job;
  showBadge?: boolean;
  compact?: boolean;
}) {
  return (
    <>
      {showBadge && (
        <div className="pk-card__head">
          <PickupJobStatusBadge status={job.status} />
        </div>
      )}
      <p className="pk-eyebrow">
        {job.data.windowFrom}–{job.data.windowTo} · {plannedPlaces(job.data)}{" "}
        мест · {job.data.weightKg ?? "—"} кг
      </p>
      <h3 className={compact ? "pk-job-title-compact" : undefined}>
        {job.data.senderName}
      </h3>
      {compact ? null : (
        <>
          <p>{job.data.address}</p>
          {job.data.defaultPlaceAddress ? (
            <p className="pk-muted">
              Место по умолчанию: {job.data.defaultPlaceAddress}
            </p>
          ) : null}
          {job.data.scheduleGroupId ? (
            <p className="pk-muted">
              Серия по графику · {job.data.scheduleGroupId.slice(0, 8)}…
            </p>
          ) : null}
          <p className="pk-muted">
            Заказчик: {job.data.customerName}
            {job.data.zayavkaNumber ? ` · Заявка ${job.data.zayavkaNumber}` : ""}
            {job.data.cargoNumber ? ` · Перевозка ${job.data.cargoNumber}` : ""}
          </p>
        </>
      )}
    </>
  );
}
type Action = (
  body: Record<string, unknown>,
  title: string,
  queueable?: boolean,
) => Promise<boolean>;
function Resolution({
  job,
  busy,
  act,
}: {
  job: Job;
  busy: boolean;
  act: Action;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="pk-resolution">
      <Textarea
        label="Решение диспетчера: перенос / отмена / работа с остатком"
        value={note}
        onChange={setNote}
      />
      <button
        disabled={busy || !note.trim()}
        onClick={() =>
          void act(
            { action: "resolve", id: job.id, version: job.version, note },
            "Решение сохранено",
          )
        }
      >
        Зафиксировать решение
      </button>
    </div>
  );
}
function JobDetails({
  job,
  call,
  driver,
  dispatcher,
  compact = false,
  canAct,
  canCancel,
  busy,
  act,
}: {
  job: Job;
  call: PickupCall;
  driver: boolean;
  dispatcher: boolean;
  compact?: boolean;
  canAct: boolean;
  canCancel: boolean;
  busy: boolean;
  act: Action;
}) {
  const [actual, setActual] = useState(""),
    [note, setNote] = useState(""),
    [photos, setPhotos] = useState<string[]>([]),
    [photoBusy, setPhotoBusy] = useState(false),
    [error, setError] = useState("");
  const [savedPhotos, setSavedPhotos] = useState<string[]>([]),
    [proofOpen, setProofOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false),
    [problemOpen, setProblemOpen] = useState(false);
  const pending = job.status === "pending" || job.status === "arrived";
  return (
    <article className={`pk-job pk-status-${job.status}`}>
      <div className="pk-actions">
        {!driver && <PickupJobStatusBadge status={job.status} />}
        {job.actual_places !== null && (
          <strong>Забрано: {job.actual_places} мест</strong>
        )}
      </div>
      {!driver ? (
        <JobSummary job={job} compact={compact && dispatcher} />
      ) : (
        <p className="pk-hint">
          Заказчик: {job.data.customerName}
          {job.data.zayavkaNumber ? ` · Заявка ${job.data.zayavkaNumber}` : ""}
          {job.data.cargoNumber ? ` · Перевозка ${job.data.cargoNumber}` : ""}
        </p>
      )}
      {compact && dispatcher && !driver ? null : (
        <>
          <div className="pk-actions">
            <a
              className={driver ? "pk-action-link" : undefined}
              href={navUrl(
                job.data.latitude !== null && job.data.longitude !== null
                  ? `${job.data.latitude},${job.data.longitude}`
                  : job.data.address,
              )}
              target="_blank"
              rel="noreferrer"
            >
              Навигация ↗
            </a>
            {job.data.directionsUrl && (
              <a href={job.data.directionsUrl} target="_blank" rel="noreferrer">
                Схема проезда ↗
              </a>
            )}
          </div>
          {(() => {
            const text = pickupSiteInstructionsDisplay(job.data.instructions);
            return text ? <p className="pk-instructions">{text}</p> : null;
          })()}
          <p>
            Склад отправителя: {job.data.warehouseHours || "График не указан"} ·
            Погрузка: {job.data.serviceMinutes} мин.
          </p>
          <div>
            {job.data.contacts.map((c, i) => (
              <p key={i}>
                <strong>{c.name || "Контакт"}</strong> · {c.purpose} ·{" "}
                <a href={`tel:${c.phone.replace(/[^+\d]/g, "")}`}>{c.phone}</a>
                {c.extension && ` доб. ${c.extension}`}
              </p>
            ))}
          </div>
          {!!job.data.documents.length && (
            <div>
              <strong>Получить по документам:</strong>
              {job.data.documents.map((d, i) => (
                <p key={i}>
                  № {d.number}
                  {d.date ? ` от ${d.date}` : " — дата не указана"}
                </p>
              ))}
            </div>
          )}
          <details>
            <summary>Груз и примечания</summary>
            {job.data.places.map((p, i) => (
              <p key={i}>
                {p.count} × {p.kind || "место"}
              </p>
            ))}
            <p>Объём: {job.data.volumeM3 ?? "—"} м³</p>
            {job.data.requirements?.trim() ? <p>{job.data.requirements}</p> : null}
            <p>{job.data.note}</p>
          </details>
        </>
      )}
      {!driver && !(compact && dispatcher) && (
        <p className="pk-muted">
          Стоимость заказчику: {job.data.priceRub ?? "—"} ₽ · Оплата:{" "}
          {job.data.payment || "Не указано"}
        </p>
      )}
      {job.note && <p className="pk-warning">{job.note}</p>}
      {job.resolution && <p className="pk-notice">Решение: {job.resolution}</p>}
      {!!job.photo_count && (
        <>
          <button
            onClick={async () => {
              setError("");
              try {
                const r = await call({ action: "photos", id: job.id });
                setSavedPhotos(
                  r.photos.map(
                    (p: any) => `data:${p.content_type};base64,${p.base64}`,
                  ),
                );
                setProofOpen(true);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Фото забора ({job.photo_count})
          </button>
          {proofOpen && (
            <div className="pk-photos">
              {savedPhotos.map((src, i) => (
                <a
                  key={i}
                  href={src}
                  download={`pickup-${job.id}-${i + 1}.jpg`}
                >
                  <img src={src} alt={`Фото забора ${i + 1}`} />
                </a>
              ))}
            </div>
          )}
        </>
      )}
      {canAct && pending && (
        <div className="pk-complete">
          <h3>Действия на точке</h3>
          <div className="pk-actions pk-driver-action-row">
            {job.status === "pending" && (
              <button
                disabled={busy || photoBusy}
                onClick={() =>
                  void act(
                    { action: "arrive", id: job.id, version: job.version },
                    "Прибыл на точку",
                    true,
                  )
                }
              >
                Прибыл на точку
              </button>
            )}
            <button
              className="pk-primary"
              disabled={busy || photoBusy}
              onClick={() => {
                setResultOpen(true);
                setProblemOpen(false);
              }}
            >
              Зафиксировать забор
            </button>
            <button
              className="pk-btn-secondary"
              disabled={busy || photoBusy}
              onClick={() => {
                setProblemOpen(true);
                setResultOpen(false);
              }}
            >
              Не удалось забрать
            </button>
          </div>
          {resultOpen && (
            <section className="pk-pickup-result">
              <h3>Подтверждение забора</h3>
              <p className="pk-hint">
                Укажите фактическое количество и приложите фото груза.
              </p>
              <button
                disabled={busy}
                onClick={() => setActual(String(plannedPlaces(job.data)))}
              >
                По плану: {plannedPlaces(job.data)} мест
              </button>
              <Field
                label="Фактически забрано мест"
                type="number"
                min="1"
                step="1"
                value={actual}
                onChange={setActual}
              />
              <Textarea
                label={
                  actual && Number(actual) !== plannedPlaces(job.data)
                    ? "Причина расхождения — обязательно"
                    : "Комментарий к забору (необязательно)"
                }
                value={note}
                onChange={setNote}
              />
              <label className="pk-field">
                <span>Фото груза — обязательно, до 3 фото</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  disabled={photoBusy || busy}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    setPhotoBusy(true);
                    setError("");
                    try {
                      if (photos.length + files.length > 3)
                        throw new Error("Можно приложить до 3 фото");
                      const ready = await Promise.all(files.map(preparePhoto));
                      setPhotos((p) => [...p, ...ready]);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setPhotoBusy(false);
                    }
                  }}
                />
              </label>
              {photoBusy && <p>Подготовка фото…</p>}
              <div className="pk-photos">
                {photos.map((src, i) => (
                  <div key={i}>
                    <img src={src} alt={`Фото ${i + 1}`} />
                    <button
                      type="button"
                      className="pk-delete-icon"
                      aria-label="Удалить фото"
                      title="Удалить фото"
                      disabled={busy}
                      onClick={() =>
                        setPhotos((p) => p.filter((_, n) => n !== i))
                      }
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
              <div className="pk-actions">
                <button
                  className="pk-primary"
                  disabled={
                    busy ||
                    photoBusy ||
                    !photos.length ||
                    !Number.isInteger(Number(actual)) ||
                    Number(actual) <= 0 ||
                    (Number(actual) !== plannedPlaces(job.data) && !note.trim())
                  }
                  onClick={() =>
                    void act(
                      {
                        action: "complete",
                        id: job.id,
                        version: job.version,
                        actual_places: Number(actual),
                        note,
                        photos,
                      },
                      "Выполнил — груз забран",
                      true,
                    )
                  }
                >
                  Подтвердить: груз забран
                </button>
              </div>
              <p className="pk-hint" role="status">
                {!actual ? "Укажите количество мест. " : ""}
                {photos.length
                  ? `Фото приложено: ${photos.length}. `
                  : "Добавьте хотя бы одно фото. "}
                {actual &&
                Number(actual) !== plannedPlaces(job.data) &&
                !note.trim()
                  ? "Объясните расхождение с планом."
                  : ""}
              </p>
            </section>
          )}
          {problemOpen && (
            <section className="pk-problem-result">
              <h3>Что помешало забрать груз?</h3>
              <div className="pk-actions">
                {[
                  "Склад закрыт",
                  "Груз не готов",
                  "Нет связи с отправителем",
                  "Не пустили на территорию",
                ].map((reason) => (
                  <button
                    disabled={busy}
                    key={reason}
                    onClick={() => setNote(reason)}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <Textarea
                label="Причина и подробности для диспетчера"
                value={note}
                onChange={setNote}
              />
              <button
                className="pk-btn-danger"
                disabled={busy || photoBusy || !note.trim()}
                onClick={() =>
                  void act(
                    {
                      action: "problem",
                      id: job.id,
                      version: job.version,
                      note,
                    },
                    "Проблема передана диспетчеру",
                    true,
                  )
                }
              >
                Сообщить диспетчеру
              </button>
            </section>
          )}
        </div>
      )}
      {canCancel && (
        <details className="pk-more-actions">
          <summary aria-label="Другие действия с забором">⋯</summary>
          <div className="pk-more-body">
            <PickupCancelJobSection
              job={job}
              busy={busy}
              onConfirm={(note) =>
                act(
                  {
                    action: "cancel",
                    id: job.id,
                    version: job.version,
                    note,
                  },
                  "Забор отменён",
                )
              }
            />
          </div>
        </details>
      )}
      {error && (
        <p className="pk-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
function RouteMap({ jobs }: { jobs: Job[] }) {
  const [open, setOpen] = useState(false);
  const points = jobs.filter(
    (j) => j.data.latitude !== null && j.data.longitude !== null,
  );
  const params = new URLSearchParams({
    pt: points
      .map((j, i) => `${j.data.longitude},${j.data.latitude},pm2blm${i + 1}`)
      .join("~"),
    z: "10",
  });
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        Карта точек ({points.length} из {jobs.length} с координатами)
      </summary>
      <p className="pk-muted">
        Нумерация на карте относится к точкам с координатами. Для адресов без
        координат используйте кнопку «Навигация».
      </p>
      {open && points.length > 0 && (
        <iframe
          className="pk-map"
          title="Карта точек забора"
          src={`https://yandex.ru/map-widget/v1/?${params}`}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
    </details>
  );
}

function DeleteJobButton({
  job,
  busy,
  act,
  compact = false,
}: {
  job: Job;
  busy: boolean;
  act: Action;
  compact?: boolean;
}) {
  return (
    <>
      <ConfirmButton
        iconLabel="Удалить забор"
        variant="danger"
        disabled={busy}
        prompt={
          pickupJobIsFinishedForCleanup(job.status)
            ? "Завершённый забор будет удалён вместе с фото в журнале. Восстановить нельзя. Удалить?"
            : job.route_id
              ? "Забор исчезнет из плана и списков. Удалить?"
              : "Забор будет удалён без возможности восстановления. Удалить?"
        }
        confirmLabel="Да, удалить"
        onConfirm={async () => {
          await act(
            {
              action: "delete_job",
              id: job.id,
              version: job.version,
            },
            "Забор удалён",
          );
        }}
      >
        <Trash2 size={compact ? 14 : 16} aria-hidden />
      </ConfirmButton>
    </>
  );
}

function DeleteRouteButton({
  route,
  busy,
  act,
  onDone,
  compact = false,
}: {
  route: Route;
  busy: boolean;
  act: Action;
  onDone: () => void;
  compact?: boolean;
}) {
  return (
    <>
      <ConfirmButton
        iconLabel="Удалить маршрут"
        variant="danger"
        disabled={busy}
        prompt={
          route.status === "draft"
            ? "Заборы вернутся в «Не распределено». Удалить этот черновик?"
            : route.status === "completed"
              ? "Заборы останутся в журнале дня без маршрута. Удалить завершённый маршрут?"
              : route.status === "started"
                ? "Заборы вернутся в «Не распределено». Удалить выполняемый маршрут?"
                : "Заборы вернутся в «Не распределено». Удалить опубликованный маршрут?"
        }
        confirmLabel="Да, удалить"
        onConfirm={async () => {
          const ok = await act(
            {
              action: "delete_route",
              id: route.id,
              version: route.version,
            },
            "Маршрут удалён",
          );
          if (ok) onDone();
        }}
      >
        <Trash2 size={compact ? 14 : 16} aria-hidden />
      </ConfirmButton>
    </>
  );
}

function ConfirmButton({
  children,
  prompt,
  confirmLabel,
  disabled,
  onConfirm,
  variant = "primary",
  iconLabel,
}: {
  children: React.ReactNode;
  prompt: string;
  confirmLabel: string;
  disabled: boolean;
  onConfirm: () => Promise<void>;
  variant?: "primary" | "danger";
  iconLabel?: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const triggerClass =
    variant === "danger"
      ? "pk-btn-danger"
      : variant === "primary"
        ? "pk-primary"
        : "";
  return (
    <span className={`pk-confirm ${confirm ? "pk-confirm--open" : ""}`}>
      {confirm ? (
        <>
          <span className="pk-confirm__prompt">{prompt}</span>
          <span className="pk-actions">
            <button
              type="button"
              className={variant === "danger" ? "pk-btn-danger" : "pk-primary"}
              disabled={disabled}
              onClick={async () => {
                await onConfirm();
                setConfirm(false);
              }}
            >
              {confirmLabel}
            </button>
            <button
              type="button"
              className="pk-btn-secondary"
              disabled={disabled}
              onClick={() => setConfirm(false)}
            >
              Отмена
            </button>
          </span>
        </>
      ) : (
        <button
          type="button"
          className={iconLabel ? "pk-delete-icon" : triggerClass}
          aria-label={iconLabel}
          title={iconLabel}
          disabled={disabled}
          onClick={() => setConfirm(true)}
        >
          {children}
        </button>
      )}
    </span>
  );
}

function DeleteResourceButton({
  resource,
  busy,
  act,
}: {
  resource: Resource;
  busy: boolean;
  act: Action;
}) {
  const label = resource.kind === "driver" ? "водителя" : "автомобиль";
  return (
    <ConfirmButton
      iconLabel={`Удалить ${label}`}
      variant="danger"
      disabled={busy}
      prompt={`Удалить ${label} из справочника? Если уже был в маршрутах — запись уйдёт в архив и скроется из списка.`}
      confirmLabel="Удалить"
      onConfirm={async () => {
        await act(
          {
            action: "delete_resource",
            id: resource.id,
            version: resource.version,
            kind: resource.kind,
          },
          resource.kind === "driver"
            ? "Водитель удалён"
            : "Автомобиль удалён",
        );
      }}
    >
      <Trash2 size={16} aria-hidden />
    </ConfirmButton>
  );
}

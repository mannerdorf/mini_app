import { pickupEventLabel } from "./pickupEventLabel";
import { PickupJobBillingEditor } from "./PickupJobBillingEditor";
import { PickupJobOrderEditor } from "./PickupJobOrderEditor";
import { usePickupOutbox } from "./usePickupOutbox";
import { PickupOutbox } from "./PickupOutbox";
import { DriverBottomNav, DriverHome, DriverProfile, type DriverTab } from "./PickupDriverNavigation";
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
  Package,
  RefreshCw,
  Copy,
  Trash2,
} from "lucide-react";
import type { Account } from "../../types";
import { useAppRuntime } from "../../contexts/AppRuntimeContext";
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
import { PickupDriverMobileRoute } from "./PickupDriverMobileRoute";
import { PickupJobNumber } from "./PickupJobNumber";
import { sendOutbox } from "./outbox";
import { prepareDependentCommand } from "./offlineProgress";
import { readDriverCity, saveDriverCity } from "./driverCity";

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
  const { useServiceRequest } = useAppRuntime();
  const serviceBrowse =
    mode === "driver" &&
    account.permissions?.service_mode === true &&
    useServiceRequest;
  const call = useMemo(
    () => pickupClient(account),
    [account.login, account.password],
  );
  const [city, setCity] = useState<City>(() => readDriverCity(account.login) || "moscow"),
    [date, setDate] = useState(() => today(readDriverCity(account.login) || "moscow"));
  const cityChosen = useRef(!!readDriverCity(account.login));
  useEffect(() => {
    const saved = readDriverCity(account.login);
    cityChosen.current = !!saved;
    setCity(saved || "moscow");
    setDate(today(saved || "moscow"));
  }, [account.login]);
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
  const serial = useRef(0),
    lock = useRef(false);
  const key = `snapshot:${account.login.toLowerCase()}:${mode}:${city}:${date}`;
  const outboxKey = `outbox:${account.login.toLowerCase()}`;
  const { items: outbox, ready: outboxReady, save: saveOutbox } = usePickupOutbox(outboxKey, setError);
  const syncOwner = useRef(outboxKey);
  syncOwner.current = outboxKey;
  const syncGeneration = useRef(0);
  useEffect(() => {
    ++syncGeneration.current;
    return () => { ++syncGeneration.current; };
  }, [outboxKey, call, allowed]);
  const dispatch = mode === "dispatch" && snapshot.dispatcher;
  const [driverTab, setDriverTab] = useState<DriverTab>("home");
  const [driverDraftDirty, setDriverDraftDirty] = useState(false);
  const driverMobileUx = mode === "driver";
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
      const result: Snapshot = await call({
        action: "snapshot",
        city,
        date,
        ...(serviceBrowse ? { serviceBrowse: true } : {}),
      });
      if (seq !== serial.current) return;
      if (mode === "driver" && !cityChosen.current && result.driverProfile?.city) {
        cityChosen.current = true;
        const preferred = result.driverProfile.city;
        if (preferred !== city) { setCity(preferred); setDate(today(preferred)); return; }
      }
      result.syncedAt = result.syncedAt || new Date().toISOString();
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
  }, [allowed, call, city, date, key, mode, serviceBrowse]);
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
  const sync = async () => {
    if (lock.current || !allowed || !outboxReady) return;
    lock.current = true;
    setBusy(true);
    const generation = syncGeneration.current;
    const isCurrentSession = () => syncOwner.current === outboxKey && syncGeneration.current === generation;
    try {
      const remaining = await sendOutbox(outbox, call, saveOutbox, isCurrentSession);
      if (!isCurrentSession()) return;
      setNotice(remaining.length ? `Требуют проверки: ${remaining.length}. Независимые отметки отправлены.` : "Все отметки отправлены");
      await refresh();
    } catch (e) {
      if (!isCurrentSession()) return;
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
    if (lock.current || (queueable && !outboxReady)) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const requestId = crypto.randomUUID(),
      command = {
        ...body,
        requestId,
        ...(serviceBrowse ? { serviceBrowse: true } : {}),
      };
    let dependency: Record<string, unknown> | null = null;
    let preparingDependency = true;
    try {
      dependency = queueable ? prepareDependentCommand(command, snapshot.jobs.find(j => j.id === body.id), outbox) : null;
      preparingDependency = false;
      if (dependency) {
        await saveOutbox([...outbox, {
          id: requestId, body: dependency, title,
          context: { address: snapshot.jobs.find(j => j.id === body.id)?.data.address || "", date, city },
        }]);
        setNotice("Отметка сохранена на устройстве. Она будет отправлена после подтверждения прибытия.");
        return true;
      }
      await call(command);
      setNotice(title);
      await refresh();
      return true;
    } catch (e) {
      if (queueable && !preparingDependency && !dependency && (!(e instanceof ApiError) || e.status >= 500)) {
        try {
          await saveOutbox([
            ...outbox,
            { id: requestId, body: command, title, context: { address: snapshot.jobs.find(j => j.id === body.id)?.data.address || "", date, city } },
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
    mode === "driver" && !serviceBrowse
      ? snapshot.routes.filter(
          (r) =>
            r.status !== "draft" &&
            r.snapshot.driver?.data.login === account.login.toLowerCase(),
        )
      : mode === "driver"
        ? snapshot.routes.filter((r) => r.status !== "draft")
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
  const routeAssignedToMe =
    !route ||
    mode !== "driver" ||
    route.snapshot.driver?.data.login?.toLowerCase() ===
      account.login.toLowerCase();
  const driverCanOperate = mode !== "driver" || routeAssignedToMe;
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
    <div
      className={`pk-root ${mode === "driver" ? "pk-driver-root" : "pk-dispatch-root"}${driverMobileUx ? " pk-driver--mobile" : ""}`}
    >
      {driverMobileUx && <DriverBottomNav tab={driverTab} onChange={setDriverTab} />}
      <header className="pk-header">
        {hideBackNav ? (
          <span className="pk-header-spacer" aria-hidden />
        ) : (
          <button disabled={driverMobileUx && driverDraftDirty} onClick={onBack} aria-label="Назад в Холз">
            <ArrowLeft size={20} />
          </button>
        )}
        <div>
          <p className="pk-eyebrow">ХОЛЗ / ЗАБОРНАЯ ЛОГИСТИКА</p>
          <h1>
            {mode === "dispatch"
              ? "Диспетчеризация"
              : serviceBrowse
                ? "Маршруты водителей"
                : driverMobileUx ? ({ home: "Мой день", route: "Мой маршрут", profile: "Профиль" }[driverTab]) : "Мой маршрут"}
          </h1>
        </div>
        <button
          disabled={busy}
          onClick={() => void refresh()}
          aria-label="Обновить"
        >
          <RefreshCw size={18} />
        </button>
      </header>
      <fieldset className="pk-driver-date-fields" disabled={driverMobileUx && driverDraftDirty} hidden={driverMobileUx && driverTab === "profile"}>
      <DayControls
        driver={mode === "driver"}
        label={`${cities[city]} · ${date}`}
      >
        <div className="pk-toolbar pk-toolbar--app-filters">
          <Select
            label="Город"
            variant="app"
            value={city}
            onChange={(v) => {
              setCity(v as City);
              cityChosen.current = true;
              saveDriverCity(account.login, v as City);
              setDate(today(v as City));
            }}
            options={Object.entries(cities).map(([id, name]) => ({ id, name }))}
          />
          <Field
            label="Дата"
            variant="app"
            type="date"
            value={date}
            onChange={setDate}
          />
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
      </fieldset>
      {driverMobileUx && driverTab === "home" && <DriverHome syncedAt={snapshot.syncedAt} error={error} routes={routes} jobs={snapshot.jobs} date={date} today={today(city)} loading={loading} stale={stale} pending={outbox.length} onToday={() => { if (!driverDraftDirty) setDate(today(city)); else setNotice("Сначала сохраните данные текущей точки"); }} onRoute={(id) => { if (driverDraftDirty && id !== route?.id) { setNotice("Сначала сохраните данные текущей точки"); return; } setSelected(id); setDriverTab("route"); }} />}
      {driverMobileUx && driverTab === "profile" && <DriverProfile profile={snapshot.driverProfile} account={account} route={route} blocked={busy || driverDraftDirty || outbox.length > 0 || !outboxReady} />}

      {error && (
        <p className="pk-error" role="alert">
          {error}
        </p>
      )}
      {serviceBrowse && (
        <p className="pk-hint pk-service-browse-note" role="status">
          Служебный режим: видны маршруты всех водителей. Отметки и GPS — только
          на своём рейсе.
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
      <PickupOutbox key={outboxKey} items={outbox} jobs={snapshot.jobs} busy={busy} stale={stale || loading}
        onSave={saveOutbox} onSync={sync} onRefresh={refresh} />
      {loading && <p role="status">Загрузка маршрутов…</p>}
      {editor && dispatch && (
        <div className="pk-editor-overlay">
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
          <div className="pk-tabs-stack">
            <nav className="pk-tabs" aria-label="Разделы диспетчеризации">
              {(
                [
                  ["jobs", "План дня"],
                  ["routes", "Маршруты"],
                  ["monitor", "Монитор рейсов"],
                  ["attention", `Внимание · ${attention.length}`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  className={tab === id ? "pk-selected" : ""}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <nav
              className="pk-tabs pk-tabs--secondary"
              aria-label="Справочники и выставление счетов"
            >
              {(
                [
                  ["directories", "Справочники"],
                  ["billing", `Выставление счетов · ${billingCount}`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  className={
                    tab === id ||
                    (id === "directories" &&
                      ["driver", "vehicle"].includes(tab))
                      ? "pk-selected"
                      : ""
                  }
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
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
        <PickupBillingTab key={`${city}:${date}`} call={call}
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
        <section className="pk-panel pk-day-plan">
          <h2>
            План дня ·{" "}
            {new Intl.DateTimeFormat("ru-RU", {
              day: "numeric",
              month: "long",
            }).format(new Date(date + "T12:00:00"))}
          </h2>
          <div className="pk-day-filters pk-day-filters--app">
            <Field
              label="Поиск заборов"
              variant="app"
              value={search}
              onChange={setSearch}
              placeholder="Адрес, заказчик, отправитель, № заявки, водитель"
            />
            <Select
              label="Показать"
              variant="app"
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
          <details className="pk-assignment-tools"><summary>Назначение заборов · выбрано {checkedJobs.length}</summary><div className="pk-actions pk-selection-tools">
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
          </div></details>
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
            <span>Номер забора</span>
            <span>Окно забора</span>
            <span>Отправитель / адрес</span>
            <span>Заказчик</span>
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

                  <PickupJobBillingEditor key={`billing-${j.id}`} job={j} busy={busy} call={call} act={act} error={error} />
                  <PickupJobOrderEditor key={j.id} job={j} busy={busy} act={act} />

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
                  </div>
                  {j.status === "cancelled" && j.resolution && (
                    <p className="pk-muted pk-cancel-reason">{j.resolution}</p>
                  )}
                </article>
              </PickupDayRow>
            ))}
        </section>
      ) : (
        <div
          style={driverMobileUx && driverTab !== "route" ? { display: "none" } : undefined}
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
                    onClick={() => { if (driverMobileUx && driverDraftDirty && r.id !== route?.id) { setNotice("Сначала сохраните данные текущей точки"); return; } setSelected(r.id); }}
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
                        {pickupJobCanCancel(j.status) && (
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
                      </div>
                    </article>
                  ))}
                </>
              )}
            </aside>
          )}
          <main className={`pk-panel${route ? " pk-route-detail" : ""}`}>
            {route && driverMobileUx ? (
              <PickupDriverMobileRoute
                syncedAt={snapshot.syncedAt}
                driverLogin={account.login}
                onDraftChange={setDriverDraftDirty}
                draftDirty={driverDraftDirty}
                route={route}
                routeJobs={routeJobs}
                city={city}
                busy={busy}
                error={error}
                stale={stale}
                outboxCount={outbox.filter(p => p.body.id === route.id || routeJobs.some(j => j.id === p.body.id)).length}
                outboxReady={outboxReady}
                routePending={routePending}
                routeCommandPending={outbox.some(item => item.body.id === route.id)}
                pendingJobIds={outbox.map(item => String(item.body.id))}
                pendingCommands={outbox}
                driverCanOperate={driverCanOperate}
                call={call}
                locationAvailable={snapshot.locationAvailable === true}
                onSync={() => void sync()}
                onStartRoute={() =>
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
                onAckRoute={() =>
                  void act(
                    {
                      action: "acknowledge",
                      id: route.id,
                      version: route.version,
                    },
                    "Изменения просмотрены",
                  )
                }
                act={act}
              />
            ) : route ? (
              <>
                <div className="pk-route-detail__head pk-route-detail__head--compact">
                <div className="pk-route-heading pk-route-heading--compact">
                  <div className="pk-route-heading__main">
                    <p className="pk-eyebrow">
                      {cities[city]} · {route.date}
                    </p>
                    <div className="pk-route-title-row">
                      <h2>{route.name}</h2>
                      <span className="pk-badge pk-badge--progress pk-badge--sm">
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
                    <p className="pk-route-meta pk-route-meta--compact">
                      <PickupRouteStatusBadge status={route.status} /> ·{" "}
                      {route.snapshot.driver?.name} ·{" "}
                      {route.snapshot.vehicle?.data.plate} · {route.start_time}
                      {routeStartAddress(route)
                        ? ` · ${routeStartAddress(route)}`
                        : " · Склад HAULZ"}
                    </p>
                  </div>
                </div>
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
                    <p key={w} className="pk-warning pk-warning--compact">
                      {w}
                    </p>
                  ))}
                {dispatch && (
                  <div className="pk-route-plan-bar">
                    <p className="pk-route-plan-summary">
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
                      м³
                    </p>
                    {(route.status === "draft" ||
                      route.status === "published" ||
                      route.status === "started" ||
                      route.status === "completed") && (
                      <div className="pk-route-actions pk-route-actions--compact">
                        {(route.status === "draft" ||
                          route.status === "published" ||
                          route.status === "started") && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditor({ type: "route", route })
                            }
                          >
                            Параметры
                          </button>
                        )}
                        <DeleteRouteButton
                          route={route}
                          busy={busy}
                          act={act}
                          compact
                          onDone={() => setSelected("")}
                        />
                        {route.status === "draft" && (
                          <PickupPublishReview
                            route={route}
                            jobs={routeJobs}
                            resources={snapshot.resources}
                            snapshot={snapshot}
                            call={call}
                            stale={stale}
                            busy={busy}
                            error={error}
                            compact
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
                            onApplyRouteOrder={(result) =>
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
                      </div>
                    )}
                  </div>
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
                              {pickupEventLabel(e.action)} ·{" "}
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
                      {driverCanOperate &&
                        mode === "driver" &&
                        route.status === "started" && (
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
                <div className="pk-actions">
                  {driverCanOperate &&
                    mode === "driver" &&
                    route.status === "published" && (
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
                {driverCanOperate &&
                  mode === "driver" &&
                  route.status === "started" && (
                  <PickupDriverLocation
                    key={route.id}
                    routeId={route.id}
                    available={snapshot.locationAvailable === true}
                    call={call}
                  />
                )}
                {driverCanOperate &&
                  mode === "driver" &&
                  route.status !== "completed" && (
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
                </div>
                <div className="pk-route-detail__stops-scroll">
                {dispatch && route.status !== "completed" && (
                  <p className="pk-hint pk-hint--stops-toolbar">
                    ⠿ перетаскивание · «Выше / Ниже»
                  </p>
                )}
                <ol
                  className={`pk-stops${dispatch && jobViewCompact ? " pk-stops--compact" : ""}`}
                >
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
                      <div
                        className={`pk-stop-content${dispatch && jobViewCompact ? " pk-stop-content--compact" : ""}`}
                      >
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
                              driverCanOperate &&
                              mode === "driver" &&
                              route.status === "started" &&
                              !outbox.some(item => item.body.id === route.id || item.body.id === j.id) &&
                              outboxReady &&
                              route.acknowledged_version === route.version
                            }
                            canCancel={
                              !dispatch &&
                              pickupJobCanCancel(j.status) &&
                              !outbox.some(item => item.body.id === route.id || item.body.id === j.id) &&
                              outboxReady &&
                              driverCanOperate &&
                              mode === "driver" &&
                              route.status !== "completed" &&
                              route.status !== "draft" &&
                              (route.status === "published" ||
                                (route.status === "started" &&
                                  route.acknowledged_version === route.version))
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
                            {pickupJobCanCancel(j.status) &&
                              !outbox.some(item => item.body.id === route.id || item.body.id === j.id) &&
                              outboxReady && (
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
                            {["problem", "partial"].includes(j.status) &&
                              !j.resolution && (
                                <Resolution job={j} busy={busy} act={act} />
                              )}
                            {["published", "started", "completed"].includes(
                              route.status,
                            ) &&
                              !jobViewCompact && (
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
                <p className="pk-route-end">
                  {route.snapshot.depot?.name?.replace(/,?\s*Москва.*/i, "") ||
                    "Склад HAULZ"}
                </p>
                </div>
                <div className="pk-route-detail__foot">
                {driverCanOperate &&
                  mode === "driver" &&
                  route.status === "started" && (
                  <div className="pk-depot-actions">
                    <p className="pk-hint">
                      {canDepositJobs(routeJobs)
                        ? "После передачи всех забранных грузов подтвердите сдачу."
                        : "Сначала завершите заборы и дождитесь решений по проблемам."}
                    </p>
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
                  </div>
                )}
                <details className="pk-history">
                  <summary>История маршрута</summary>
                  {snapshot.events
                    .filter((e) => e.route_id === route.id)
                    .map((e) => (
                      <div key={e.id}>
                        <strong>{pickupEventLabel(e.action)}</strong> ·{" "}
                        {new Date(e.created_at).toLocaleString("ru-RU", {
                          timeZone:
                            city === "moscow"
                              ? "Europe/Moscow"
                              : "Europe/Kaliningrad",
                        })}{" "}
                        · {e.actor}
                        {e.data.note ? ` — ${e.data.note}` : ""}
                        <details><summary>Технические сведения</summary><code>{e.action}</code></details>
                      </div>
                    ))}
                </details>
                </div>
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
function JobCompactSummary({ job }: { job: Job }) {
  return (
    <div className="pk-job-compact">
      <PickupJobNumber job={job} />
      <div className="pk-job-compact__head">
        <PickupJobStatusBadge status={job.status} />
        <span className="pk-job-compact__meta">
          {job.data.windowFrom}–{job.data.windowTo} · {plannedPlaces(job.data)}{" "}
          м · {job.data.weightKg ?? "—"} кг
        </span>
        <a
          className="pk-job-compact__nav"
          href={navUrl(
            job.data.latitude !== null && job.data.longitude !== null
              ? `${job.data.latitude},${job.data.longitude}`
              : job.data.address,
          )}
          target="_blank"
          rel="noreferrer"
        >
          ↗
        </a>
      </div>
      <p className="pk-job-compact__title">{job.data.senderName}</p>
      <p className="pk-job-compact__address" title={job.data.address}>
        {job.data.address}
      </p>
    </div>
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
      {compact ? (
        <JobCompactSummary job={job} />
      ) : (
        <>
          <PickupJobNumber job={job} prominent />
          <p className="pk-eyebrow">
            {job.data.windowFrom}–{job.data.windowTo} ·{" "}
            {plannedPlaces(job.data)} мест · {job.data.weightKg ?? "—"} кг
          </p>
          <h3>{job.data.senderName}</h3>
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
  const dispatcherCompact = compact && dispatcher && !driver;
  return (
    <article
      className={`pk-job pk-status-${job.status}${dispatcherCompact ? " pk-job--dispatcher-compact" : ""}`}
    >
      {!dispatcherCompact && (
        <div className="pk-actions">
          {!driver && <PickupJobStatusBadge status={job.status} />}
          {job.actual_places !== null && (
            <strong>Забрано: {job.actual_places} мест</strong>
          )}
        </div>
      )}
      {!driver ? (
        <JobSummary job={job} compact={dispatcherCompact} />
      ) : (
        <p className="pk-hint">
          Заказчик: {job.data.customerName}
          {job.data.zayavkaNumber ? ` · Заявка ${job.data.zayavkaNumber}` : ""}
          {job.data.cargoNumber ? ` · Перевозка ${job.data.cargoNumber}` : ""}
        </p>
      )}
      {dispatcherCompact ? null : (
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
      {!driver && !dispatcherCompact && (
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
        <div className="pk-actions pk-actions--driver-cancel">
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
      )}
      {error && (
        <p className="pk-error" role="alert">
          {error}
        </p>
      )}
    </article>
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
            : route.status === "started"
              ? "Маршрут выполняется. После удаления он исчезнет у водителя. Заборы останутся без маршрута с текущими статусами; фото и история сохранятся. Удалить маршрут?"
              : "Заборы останутся в журнале дня без маршрута с текущими статусами. Фото и история сохранятся. Удалить этот маршрут?"
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

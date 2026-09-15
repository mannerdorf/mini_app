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
} from "lucide-react";
import type { Account } from "../../types";
import {
  cities,
  plannedPlaces,
  routeWarnings,
  statusLabels,
  type City,
  type Snapshot,
  type Job,
  type Route,
  type Resource,
  type ResourceKind,
} from "../../../lib/pickup/model";
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
import "./pickup.css";
import "../../styles/haulz-calculator.css";

const routeLabels = {
  draft: "Черновик",
  published: "Опубликован",
  started: "Выполняется",
  completed: "Завершён",
};
const empty: Snapshot = {
  resources: [],
  jobs: [],
  routes: [],
  events: [],
  dispatcher: false,
};
type Editor =
  | { type: "job"; job?: Job }
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

export function PickupPage({
  account,
  mode,
  onBack,
}: {
  account: Account;
  mode: "dispatch" | "driver";
  onBack: () => void;
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
  const [tab, setTab] = useState("routes"),
    [editor, setEditor] = useState<Editor>(null),
    [selected, setSelected] = useState("");
  const [outbox, setOutbox] = useState<Pending[]>([]);
  const [outboxReady, setOutboxReady] = useState(false);
  const serial = useRef(0),
    lock = useRef(false);
  const key = `snapshot:${account.login.toLowerCase()}:${mode}:${city}:${date}`;
  const outboxKey = `outbox:${account.login.toLowerCase()}`;
  const dispatch = mode === "dispatch" && snapshot.dispatcher;
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
    setLoading(true);
    setStale(false);
    void refresh();
    const timer = window.setInterval(refresh, 30000);
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
  const route = routes.find((r) => r.id === selected) ?? routes[0];
  const routeJobs = route
    ? snapshot.jobs
        .filter((j) => j.route_id === route.id)
        .sort((a, b) => a.position - b.position)
    : [];
  const unassigned = snapshot.jobs.filter((j) => !j.route_id);
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
    <div className="pk-root">
      <header className="pk-header">
        <button onClick={onBack} aria-label="Назад в Холз">
          <ArrowLeft size={20} />
        </button>
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
                Удалить локальную отметку
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
              city={city}
              date={date}
              call={call}
              account={account}
              done={finishEditor}
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
          <div className="pk-stats">
            <div>
              <strong>{snapshot.jobs.length}</strong>
              <span>Заборов за день</span>
            </div>
            <div>
              <strong>{unassigned.length}</strong>
              <span>Не распределено</span>
            </div>
            <div>
              <strong>
                {
                  snapshot.jobs.filter((j) =>
                    ["picked_up", "partial", "deposited"].includes(j.status),
                  ).length
                }
              </strong>
              <span>Груз забран</span>
            </div>
            <div>
              <strong>
                {
                  snapshot.jobs.filter(
                    (j) =>
                      ["partial", "problem"].includes(j.status) &&
                      !j.resolution,
                  ).length
                }
              </strong>
              <span>Требуют решения</span>
            </div>
          </div>
          <nav className="pk-tabs" aria-label="Разделы диспетчеризации">
            {[
              ["routes", "Маршруты"],
              ["jobs", "Все заборы"],
              ["driver", "Водители"],
              ["vehicle", "Автомобили"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={tab === id ? "pk-selected" : ""}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </>
      )}
      {dispatch && (tab === "driver" || tab === "vehicle") ? (
        <section className="pk-panel">
          <div className="pk-actions">
            <h2>
              Справочник: {tab === "driver" ? "водители" : "автомобили"}
            </h2>
            <button onClick={() => setEditor({ type: tab as ResourceKind })}>
              + Добавить
            </button>
          </div>
          <div className="pk-resource-grid">
            {snapshot.resources
              .filter((r) => r.kind === tab)
              .map((r) => (
                <article className="pk-card" key={r.id}>
                  <h3>{r.name}</h3>
                  <p>
                    {r.active ? "Доступен" : "Недоступен / архив"} ·{" "}
                    {r.data.type === "hired"
                      ? "Наёмный"
                      : r.data.type === "own"
                        ? "Собственный"
                        : ""}
                  </p>
                  <p>{r.data.phone || r.data.plate || r.data.address}</p>
                  <p>
                    {r.data.from}–{r.data.to}
                  </p>
                  <p className="pk-muted">{r.data.login || r.data.model}</p>
                  <button
                    onClick={() => setEditor({ type: r.kind, resource: r })}
                  >
                    Изменить
                  </button>
                </article>
              ))}
          </div>
          {!snapshot.resources.some((r) => r.kind === tab) && (
            <p className="pk-empty">
              Добавьте первую запись для города {cities[city]}.
            </p>
          )}
        </section>
      ) : dispatch && tab === "jobs" ? (
        <section className="pk-panel">
          <h2>Заборы · {date}</h2>
          {snapshot.jobs.map((j) => (
            <article key={j.id} className="pk-card">
              <JobSummary job={j} />
              <div className="pk-actions">
                <span>{statusLabels[j.status]}</span>
                {!j.route_id && j.status === "pending" && (
                  <button onClick={() => setEditor({ type: "job", job: j })}>
                    Изменить
                  </button>
                )}
                <span>
                  {snapshot.routes.find((r) => r.id === j.route_id)?.name ??
                    "Не распределён"}
                </span>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div
          className={`pk-workspace ${!dispatch ? "pk-driver-workspace" : ""}`}
        >
          <aside className="pk-panel">
            <h2>
              <Truck size={20} /> Маршруты · {routes.length}
            </h2>
            {routes.map((r) => (
              <button
                className={`pk-route-tile ${route?.id === r.id ? "pk-selected" : ""}`}
                key={r.id}
                onClick={() => setSelected(r.id)}
              >
                <strong>{r.name}</strong>
                <span>
                  {r.start_time} · {routeLabels[r.status]}
                </span>
                <span>{r.snapshot.driver?.name}</span>
                <span>{r.snapshot.vehicle?.data.plate}</span>
              </button>
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
                  <article className="pk-card" key={j.id}>
                    <JobSummary job={j} />
                    <div className="pk-actions">
                      <button
                        onClick={() => setEditor({ type: "job", job: j })}
                      >
                        Изменить
                      </button>
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
                  </article>
                ))}
              </>
            )}
          </aside>
          <main className="pk-panel">
            {route ? (
              <>
                <div className="pk-route-heading">
                  <div>
                    <p className="pk-eyebrow">
                      {cities[city]} · {route.date}
                    </p>
                    <h2>{route.name}</h2>
                    <p>
                      {routeLabels[route.status]} ·{" "}
                      {route.snapshot.driver?.name} ·{" "}
                      {route.snapshot.vehicle?.data.plate}
                    </p>
                  </div>
                  <span className="pk-badge">
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
                {routeWarnings(routeJobs, route.snapshot.vehicle).map((w) => (
                  <p key={w} className="pk-warning">
                    {w}
                  </p>
                ))}
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
                  м³. Время в пути не рассчитано; окна и проезд проверяет
                  диспетчер.
                </p>
                {route.status !== "draft" &&
                  route.status !== "completed" &&
                  route.acknowledged_version !== route.version && (
                    <div className="pk-warning">
                      <strong>Маршрут новый или изменён</strong>
                      <p>Проверьте состав и порядок остановок.</p>
                      {mode === "driver" && (
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
                  {dispatch && route.status === "draft" && (
                    <>
                      <button
                        onClick={() => setEditor({ type: "route", route })}
                      >
                        Параметры
                      </button>
                      <button
                        className="pk-primary"
                        disabled={busy || !routeJobs.length}
                        onClick={() =>
                          void act(
                            {
                              action: "publish",
                              id: route.id,
                              version: route.version,
                            },
                            "Маршрут опубликован водителю",
                          )
                        }
                      >
                        Опубликовать водителю
                      </button>
                    </>
                  )}
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
                      Приступил к выполнению
                    </button>
                  )}
                </div>
                <RouteMap jobs={routeJobs} />
                <ol className="pk-stops">
                  {routeJobs.map((j, i) => (
                    <li key={j.id}>
                      <div className="pk-stop-number">{i + 1}</div>
                      <div className="pk-stop-content">
                        <JobDetails
                          key={`${j.id}:${j.version}`}
                          job={j}
                          call={call}
                          driver={mode === "driver"}
                          canAct={
                            mode === "driver" &&
                            route.status === "started" &&
                            !routePending &&
                            outboxReady &&
                            route.acknowledged_version === route.version
                          }
                          busy={busy}
                          act={act}
                        />
                        {dispatch && route.status !== "completed" && (
                          <div className="pk-actions">
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
                      <p>
                        <ConfirmButton
                          prompt="Все забранные грузы переданы на склад Холз?"
                          confirmLabel="Подтвердить сдачу"
                          disabled={
                            busy ||
                            routePending ||
                            !outboxReady ||
                            !routeJobs.length ||
                            !routeJobs.every(
                              (j) =>
                                ["picked_up", "deposited", "resolved"].includes(
                                  j.status,
                                ) ||
                                (j.status === "partial" && j.resolution),
                            )
                          }
                          onConfirm={async () => {
                            await act(
                              {
                                action: "deposit",
                                id: route.id,
                                version: route.version,
                              },
                              "Грузы сданы на склад",
                              true,
                            );
                          }}
                        >
                          Сдал на склад
                        </ConfirmButton>
                      </p>
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
              <p className="pk-empty">Выберите маршрут</p>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
function JobSummary({ job }: { job: Job }) {
  return (
    <>
      <p className="pk-eyebrow">
        {job.data.windowFrom}–{job.data.windowTo} · {plannedPlaces(job.data)}{" "}
        мест · {job.data.weightKg ?? "—"} кг
      </p>
      <h3>{job.data.senderName}</h3>
      <p>{job.data.address}</p>
      {job.data.defaultPlaceAddress ? (
        <p className="pk-muted">
          Место по умолчанию: {job.data.defaultPlaceAddress}
        </p>
      ) : null}
      <p className="pk-muted">
        Заказчик: {job.data.customerName}
        {job.data.zayavkaNumber ? ` · Заявка ${job.data.zayavkaNumber}` : ""}
        {job.data.cargoNumber ? ` · Перевозка ${job.data.cargoNumber}` : ""}
      </p>
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
  canAct,
  busy,
  act,
}: {
  job: Job;
  call: PickupCall;
  driver: boolean;
  canAct: boolean;
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
  const pending = job.status === "pending" || job.status === "arrived";
  return (
    <article className={`pk-job pk-status-${job.status}`}>
      <div className="pk-actions">
        <span className="pk-badge">{statusLabels[job.status]}</span>
        {job.actual_places !== null && (
          <strong>Забрано: {job.actual_places} мест</strong>
        )}
      </div>
      <JobSummary job={job} />
      <div className="pk-actions">
        <a
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
            {p.count} × {p.kind || "место"} · {p.lengthCm ?? "—"} ×{" "}
            {p.widthCm ?? "—"} × {p.heightCm ?? "—"} см
          </p>
        ))}
        <p>Объём: {job.data.volumeM3 ?? "—"} м³</p>
        <p>{job.data.requirements}</p>
        <p>{job.data.note}</p>
      </details>
      {!driver && (
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
          <h3>Результат забора</h3>
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
          <Field
            label="Фактически забрано мест"
            type="number"
            min="1"
            step="1"
            value={actual}
            onChange={setActual}
          />
          <Textarea
            label="Комментарий / причина расхождения / проблема"
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
                  disabled={busy}
                  onClick={() => setPhotos((p) => p.filter((_, n) => n !== i))}
                >
                  Удалить
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
              Выполнил — груз забран
            </button>
            <button
              className="pk-danger"
              disabled={busy || photoBusy || !note.trim()}
              onClick={() =>
                void act(
                  { action: "problem", id: job.id, version: job.version, note },
                  "Проблема на точке",
                  true,
                )
              }
            >
              Проблема / не забрал
            </button>
          </div>
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

function ConfirmButton({
  children,
  prompt,
  confirmLabel,
  disabled,
  onConfirm,
}: {
  children: React.ReactNode;
  prompt: string;
  confirmLabel: string;
  disabled: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <span className="pk-actions">
      {confirm ? (
        <>
          <span>{prompt}</span>
          <button
            className="pk-primary"
            disabled={disabled}
            onClick={async () => {
              await onConfirm();
              setConfirm(false);
            }}
          >
            {confirmLabel}
          </button>
          <button disabled={disabled} onClick={() => setConfirm(false)}>
            Отмена
          </button>
        </>
      ) : (
        <button
          className="pk-primary"
          disabled={disabled}
          onClick={() => setConfirm(true)}
        >
          {children}
        </button>
      )}
    </span>
  );
}

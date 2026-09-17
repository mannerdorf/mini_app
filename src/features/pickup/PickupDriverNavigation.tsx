import React, { useEffect, useState } from "react";
import { WEB_BUILD_INFO } from "../../constants/appVersion";
import { checkWebBuild } from "../../lib/webBuildUpdate";
import { Home, Route as RouteIcon, UserRound, ArrowRight, RefreshCw } from "lucide-react";
import type { Account } from "../../types";
import { type Route, type Job, type Snapshot, routeStartAddress } from "../../../lib/pickup/model";
import { driverStopProgress } from "./driverMobileFlow";
import { PickupRouteStatusBadge } from "./PickupRouteStatusBadge";
import { getAppVersionSnapshot, checkAppReleaseUpdate, openAndroidReleaseDownload, reloadWebApp, type AppVersionSnapshot, type AppUpdateCheckResult } from "../../lib/appVersionInfo";

export type DriverTab = "home" | "route" | "profile";
export function DriverBottomNav({ tab, onChange }: { tab: DriverTab; onChange: (tab: DriverTab) => void }) {
  return <nav className="pk-driver-nav" aria-label="Меню водителя">
    {([{ id: "home", label: "Главная", Icon: Home }, { id: "route", label: "Маршрут", Icon: RouteIcon }, { id: "profile", label: "Профиль", Icon: UserRound }] as const).map(({ id, label, Icon }) =>
      <button key={id} type="button" aria-current={tab === id ? "page" : undefined} onClick={() => onChange(id)}><Icon size={22} aria-hidden /><span>{label}</span></button>)}
  </nav>;
}
export function DriverHome({ routes, jobs, date, today, loading, onToday, onRoute, stale, pending, syncedAt, error }: {
  syncedAt?: string; error?: string;
  routes: Route[]; jobs: Job[]; date: string; today: string; loading: boolean;
  onToday: () => void; onRoute: (id: string) => void; stale: boolean; pending: number;
}) {
  const active = routes.find((r) => r.status === "started") ?? routes.find((r) => r.status === "published");
  const total = jobs.filter((j) => routes.some((r) => r.id === j.route_id) && j.status !== "cancelled");
  const progress = driverStopProgress(total);
  return <section className="pk-driver-home" aria-label="Обзор дня">
    <div className="pk-driver-day-card">
      <p className="pk-eyebrow">{date === today ? "СЕГОДНЯ" : "ВЫБРАННЫЙ ДЕНЬ"}</p>
      <h2>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" }).format(new Date(`${date}T12:00:00`))}</h2>
      <p role="status">{loading ? "Обновляем данные…" : stale ? "Не удалось обновить данные" : "Данные получены с сервера"}
        {syncedAt ? ` · Синхронизация: ${new Date(syncedAt).toLocaleString("ru-RU")}` : " · Время синхронизации неизвестно"}
        {` · Ожидают отправки: ${pending}`}</p>
      {error && <p className="pk-warning" role="alert">{error}</p>}
      <div className="pk-driver-day-numbers"><span><strong>{routes.length}</strong> {routes.length % 10 === 1 && routes.length % 100 !== 11 ? "рейс" : routes.length % 10 >= 2 && routes.length % 10 <= 4 && (routes.length % 100 < 12 || routes.length % 100 > 14) ? "рейса" : "рейсов"}</span><span><strong>{progress.closed} / {progress.total}</strong> точек обработано</span></div>
      {date !== today && <button type="button" onClick={onToday}>Вернуться к сегодняшнему дню</button>}
      {active && <button className="pk-primary pk-driver-mobile-cta" onClick={() => onRoute(active.id)}>{active.status === "started" ? "Продолжить рейс" : "Посмотреть маршрут"}<ArrowRight size={18} /></button>}
    </div>
    <h2>Рейсы на день</h2>
    {!routes.length && !error && <div className="pk-panel"><h3>{loading ? "Загружаем рейсы…" : "Назначенных рейсов пока нет"}</h3><p className="pk-hint">{loading ? "Подождите немного." : "Проверьте город и дату. Новый рейс появится после публикации диспетчером."}</p></div>}
    {routes.map((route) => {
      const items = total.filter((j) => j.route_id === route.id);
      const p = driverStopProgress(items);
      return <button className="pk-driver-trip-card" key={route.id} onClick={() => onRoute(route.id)}>
        <span className="pk-driver-trip-card__top"><strong>{route.start_time} · {route.name}</strong><ArrowRight size={20} aria-hidden /></span>
        <PickupRouteStatusBadge status={route.status} />
        <span>Старт: {routeStartAddress(route) || "Склад HAULZ"}</span>
        <progress value={p.closed} max={Math.max(1, p.total)} aria-label={`Прогресс: ${route.name}`} />
        <span>{p.closed} из {p.total} точек обработано · {route.snapshot.vehicle?.data.plate || "Автомобиль не указан"}</span>
      </button>;
    })}
  </section>;
}
export function DriverProfile({ account, route, blocked, profile }: { account: Account; route?: Route; blocked: boolean; profile?: Snapshot["driverProfile"] }) {
  const [version, setVersion] = useState<AppVersionSnapshot>();
  const [result, setResult] = useState<AppUpdateCheckResult>();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [webUpdate, setWebUpdate] = useState(false);
  const nativeIos = version?.platform.source === "capacitor" && version.platform.platform === "ios";
  useEffect(() => { let live = true; void getAppVersionSnapshot().then((v) => { if (live) setVersion(v); }).catch(() => { if (live) setMessage("Не удалось определить версию. Откройте профиль ещё раз."); }); return () => { live = false; }; }, []);
  return <section className="pk-driver-profile" aria-label="Профиль водителя">
    <div className="pk-panel"><p className="pk-eyebrow">ВОДИТЕЛЬ HAULZ</p><h2>{profile?.name || account.login}</h2><p className="pk-hint">{account.login}</p>
      {profile?.phone && <p>{profile.phone}</p>}{profile?.phoneExtra && <p>Дополнительный телефон: {profile.phoneExtra}</p>}
      {profile?.carrier && <p>Перевозчик: {profile.carrier}</p>}
      {!profile && <p className="pk-hint">Карточка водителя недоступна. Попросите диспетчера проверить справочник.</p>}
      {route?.snapshot.vehicle && <p>Снимок рейса на {route.date}: <strong>{route.snapshot.vehicle.name} · {route.snapshot.vehicle.data.plate}</strong></p>}
    </div>
    <div className="pk-panel"><h2>Приложение</h2><p>{version?.platformLabel || "Определяем платформу…"}</p><p>Версия {version?.install.versionName || "—"}{version?.install.buildNumber != null ? ` · сборка ${version.install.buildNumber}` : ""}</p>
      <p className="pk-hint">Перед обновлением завершите ввод на текущей точке и отправьте сохранённые отметки.</p>
      <p className="pk-hint">Сборка интерфейса: {WEB_BUILD_INFO.id}<br />{WEB_BUILD_INFO.builtAt && new Date(WEB_BUILD_INFO.builtAt).toLocaleString("ru-RU")}</p>
      {nativeIos && <p className="pk-hint">Обновите HAULZ через TestFlight или App Store — в зависимости от того, откуда установлено приложение.</p>}
      {blocked && <p className="pk-warning" role="status">Сначала сохраните данные точки и дождитесь синхронизации.</p>}
      <button type="button" className="pk-primary pk-driver-mobile-cta" disabled={!version || blocked || checking} onClick={async () => {
        if (!version || blocked) return;
        if (nativeIos) { setMessage("Откройте TestFlight или App Store, найдите HAULZ и нажмите «Обновить», если доступна новая версия."); return; }
        if (!version.isNativeAndroid) {
          setChecking(true); setMessage("");
          try { const state = await checkWebBuild(); setWebUpdate(state === "available"); setMessage(state === "unavailable" ? "Не удалось проверить обновление. Попробуйте позже." : state === "current" ? "Установлена актуальная web-сборка" : "Доступна новая web-сборка"); }
          finally { setChecking(false); }
          return;
        }
        setChecking(true); setResult(undefined); setMessage("");
        try { const next = await checkAppReleaseUpdate(true); setResult(next); setMessage(!next.remote ? "Нет связи с сервером обновлений. Попробуйте позже." : next.snapshot.install.buildNumber == null ? "Не удалось определить номер установленной сборки." : next.updateAvailable ? `Доступна версия ${next.remote.versionName}` : "Установлена актуальная версия"); }
        catch { setMessage("Не удалось проверить обновление. Попробуйте позже."); }
        finally { setChecking(false); }
      }}><RefreshCw size={18} />{checking ? "Проверяем…" : nativeIos ? "Как обновить iOS" : "Проверить обновление"}</button>
      {webUpdate && <button type="button" disabled={blocked || checking} onClick={reloadWebApp}>Установить web-обновление</button>}
      {message && <p role="status">{message}</p>}
      {result?.updateAvailable && result.remote && <button type="button" disabled={blocked} onClick={() => openAndroidReleaseDownload(result.remote!.apkUrl)}>Скачать обновление Android</button>}
    </div>
  </section>;
}

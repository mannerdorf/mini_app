import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import type { ExtraServicePayload, MainlinePayload, PickupMatrixPayload, PickupTier } from "../../../../lib/haulzCalculator/types";
import {
  fetchAdminHaulzCalculatorTariffs,
  fetchAdminHaulzTariffHistory,
  type TariffVersionHistory,
  fetchAdminHubs,
  fetchAdminRingExits,
  importAdminHaulzFile,
  initAdminHaulzCalculator,
  publishAdminHaulzTariffVersion,
  saveAdminHub,
  saveAdminRingExit,
  seedAdminRingExits,
  type AdminHaulzTariffSet,
  type HubRow,
} from "../../../api/client/admin/haulzCalculatorAdmin";
import {
  describeTariffVersionPayload,
  formatTariffDateRu,
  tariffSetSelectLabel,
} from "../../../../lib/haulzCalculator/tariffVersionSummary";

type AdminTab =
  | "pickup"
  | "last_mile"
  | "mainline"
  | "extras"
  | "ring"
  | "settings"
  | "hubs"
  | "import"
  | "history";

const TAB_LABELS: Record<AdminTab, string> = {
  pickup: "Забор",
  last_mile: "Последняя миля",
  mainline: "Магистраль",
  extras: "Доп. услуги",
  ring: "МКАД / КАД",
  settings: "Настройки",
  hubs: "Хабы",
  import: "Импорт",
  history: "История версий",
};

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());
}

function versionPayload(set: AdminHaulzTariffSet | undefined): unknown | undefined {
  if (!set) return undefined;
  return set.active_version?.payload ?? set.latest_version?.payload;
}

function TierTable({ tiers, onChange }: { tiers: PickupTier[]; onChange: (t: PickupTier[]) => void }) {
  return (
    <div className="hr-calc-admin-table-wrap">
      <table className="hr-calc-admin-table hr-calc-admin-table--numeric">
        <thead>
          <tr>
            <th>Вес max</th>
            <th>Объём max</th>
            <th>По городу</th>
            <th>₽/км</th>
            <th>Погрузка мин</th>
            <th>Сверхнорм ₽/ч</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t, i) => (
            <tr key={i}>
              {(["weight_max_kg", "volume_max_m3", "city_fee", "per_km", "load_minutes", "overtime_rub_per_hour"] as const).map(
                (field) => (
                  <td key={field}>
                    <input
                      type="number"
                      className="hr-calc-admin-input hr-calc-admin-input--num"
                      value={t[field] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? undefined : Number(e.target.value);
                        const next = [...tiers];
                        next[i] = { ...next[i], [field]: v };
                        onChange(next);
                      }}
                    />
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TariffVersionSummary({
  tariffCode,
  block,
  payload,
}: {
  tariffCode: string;
  block: string;
  payload: unknown;
}) {
  const lines = describeTariffVersionPayload(tariffCode, block, payload);
  return (
    <ul className="hr-calc-admin-history-summary">
      {lines.map((line, i) => (
        <li key={`${i}-${line.slice(0, 24)}`}>{line}</li>
      ))}
    </ul>
  );
}

export function AdminHaulzCalculatorSection({ adminToken }: { adminToken: string }) {
  const [tab, setTab] = useState<AdminTab>("pickup");
  const [sets, setSets] = useState<AdminHaulzTariffSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [pickupDraft, setPickupDraft] = useState<PickupMatrixPayload | null>(null);
  const [lastMileDraft, setLastMileDraft] = useState<PickupMatrixPayload | null>(null);
  const [extrasDraft, setExtrasDraft] = useState<ExtraServicePayload[]>([]);
  const [settingsFactor, setSettingsFactor] = useState("200");
  const [mainlineDrafts, setMainlineDrafts] = useState<MainlinePayload[]>([]);
  const [ringCity, setRingCity] = useState<"moscow" | "kaliningrad">("moscow");
  const [ringExits, setRingExits] = useState<Awaited<ReturnType<typeof fetchAdminRingExits>>>([]);
  const [hubs, setHubs] = useState<HubRow[]>([]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importKind, setImportKind] = useState<"pickup_xlsx" | "mkad_mxl">("pickup_xlsx");
  const [historySetId, setHistorySetId] = useState<number | "">("");
  const [historyRows, setHistoryRows] = useState<TariffVersionHistory[]>([]);
  const [historyActive, setHistoryActive] = useState<TariffVersionHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(false);

  const loadSets = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchAdminHaulzCalculatorTariffs(adminToken);
      setSets(list);
      const pickup = list.find((s) => s.code === "pickup_matrix");
      const lastMile = list.find((s) => s.code === "last_mile_matrix");
      const extras = list.find((s) => s.code === "calc_extras");
      const settings = list.find((s) => s.code === "calc_settings");
      const pickupPayload = versionPayload(pickup);
      const lastMilePayload = versionPayload(lastMile);
      if (pickupPayload) setPickupDraft(pickupPayload as PickupMatrixPayload);
      else setPickupDraft(null);
      if (lastMilePayload) setLastMileDraft(lastMilePayload as PickupMatrixPayload);
      else setLastMileDraft(null);
      const extrasP = versionPayload(extras);
      if (extrasP) {
        const p = extrasP as { services?: ExtraServicePayload[] };
        setExtrasDraft(p.services ?? []);
      } else {
        setExtrasDraft([]);
      }
      const settingsP = versionPayload(settings);
      if (settingsP) {
        const p = settingsP as { volumetric_factor_kg_m3?: number };
        setSettingsFactor(String(p.volumetric_factor_kg_m3 ?? 200));
      }
      const ml: MainlinePayload[] = [];
      for (const s of list.filter((x) => x.block === "mainline")) {
        const p = versionPayload(s) as MainlinePayload | undefined;
        if (p?.mode) ml.push(p);
      }
      setMainlineDrafts(ml);
    } catch (e) {
      setError((e as Error)?.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  const loadRing = useCallback(async () => {
    if (!adminToken) return;
    try {
      setRingExits(await fetchAdminRingExits(adminToken, ringCity));
    } catch (e) {
      setError((e as Error)?.message || "Ошибка съездов");
    }
  }, [adminToken, ringCity]);

  const loadHubs = useCallback(async () => {
    if (!adminToken) return;
    try {
      setHubs(await fetchAdminHubs(adminToken));
    } catch (e) {
      setError((e as Error)?.message || "Ошибка хабов");
    }
  }, [adminToken]);

  useEffect(() => {
    void loadSets();
  }, [loadSets]);

  useEffect(() => {
    if (tab === "ring") void loadRing();
  }, [tab, loadRing]);

  useEffect(() => {
    if (tab === "hubs") void loadHubs();
  }, [tab, loadHubs]);

  useEffect(() => {
    if (tab !== "history" || !adminToken || !historySetId) return;
    setHistoryLoading(true);
    void fetchAdminHaulzTariffHistory(adminToken, Number(historySetId))
      .then(({ history, active }) => {
        setHistoryRows(history);
        setHistoryActive(active);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setHistoryLoading(false));
  }, [tab, adminToken, historySetId]);

  const setByCode = useMemo(() => Object.fromEntries(sets.map((s) => [s.code, s])), [sets]);
  const historySet = useMemo(
    () => (historySetId ? sets.find((s) => s.id === Number(historySetId)) : undefined),
    [sets, historySetId],
  );

  const runBootstrap = async () => {
    setInitLoading(true);
    setError(null);
    try {
      const r = await initAdminHaulzCalculator(adminToken, effectiveFrom);
      setMessage(
        r.wasEmpty
          ? `Создана структура тарифов (${r.sets} наборов). Загрузите xlsx на вкладке «Импорт» или отредактируйте таблицы.`
          : `Структура тарифов проверена (${r.sets} наборов). Отсутствующие наборы добавлены.`,
      );
      await loadSets();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setInitLoading(false);
    }
  };

  const publish = async (code: string, payload: unknown) => {
    let set = setByCode[code];
    if (!set) {
      await initAdminHaulzCalculator(adminToken, effectiveFrom);
      await loadSets();
      const list = await fetchAdminHaulzCalculatorTariffs(adminToken);
      set = Object.fromEntries(list.map((s) => [s.code, s]))[code];
    }
    if (!set) throw new Error(`Тариф ${code} не найден — нажмите «Создать структуру тарифов»`);
    await publishAdminHaulzTariffVersion(adminToken, set.id, effectiveFrom, payload);
    setMessage(`Новая версия «${code}» с ${effectiveFrom} сохранена`);
    await loadSets();
  };

  const savePickup = async (scope: "pickup" | "last_mile") => {
    const draft = scope === "pickup" ? pickupDraft : lastMileDraft;
    const code = scope === "pickup" ? "pickup_matrix" : "last_mile_matrix";
    if (!draft) return;
    await publish(code, { ...draft, scope });
  };

  if (!adminToken) return null;

  return (
    <div className="hr-calc-admin">
      <header className="hr-calc-admin__header">
        <h2 className="hr-calc-admin__title">Тарифы калькулятора HAULZ</h2>
        <p className="hr-calc-admin__subtitle">
          Версии с датой вступления в силу. Тарифы на {sets[0]?.active_version?.effective_from ?? "—"} (актуальные).
        </p>
      </header>

      <div className="hr-calc-admin__toolbar">
        <label className="hr-calc-admin__field">
          <span className="hr-calc-admin__label">Новая версия с даты</span>
          <input
            type="date"
            className="hr-calc-admin-input"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="button-primary"
          disabled={initLoading || loading}
          onClick={() => void runBootstrap()}
        >
          {initLoading ? "Создание…" : "Создать структуру тарифов"}
        </button>
      </div>

      <p className="hr-calc-admin__hint">
        Данные из xlsx — вкладка «Импорт». Новые цены — выберите дату выше и «Сохранить версию…» на нужной вкладке (это не отдельный
        тариф, а версия с новой датой). Сейчас в БД: {sets.length} наборов
        {sets.length > 0 && sets[0]?.active_version?.effective_from
          ? `, актуально с ${sets[0].active_version.effective_from}`
          : sets.length > 0
            ? " (нет версии на сегодня — нажмите «Создать структуру» или импорт)"
            : " — сначала «Создать структуру тарифов»"}
        .
      </p>

      <nav className="hr-calc-admin-tabs" role="tablist" aria-label="Разделы тарифов">
        {(Object.keys(TAB_LABELS) as AdminTab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`hr-calc-admin-tab${tab === t ? " active" : ""}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>

      {loading && (
        <div className="hr-calc-admin__loading">
          <Loader2 className="w-4 h-4 animate-spin" />
          Загрузка…
        </div>
      )}
      {error && <div className="hr-calc-admin-alert hr-calc-admin-alert--error">{error}</div>}
      {message && <div className="hr-calc-admin-alert hr-calc-admin-alert--success">{message}</div>}

      <div className="hr-calc-admin__panel">
      {tab === "pickup" && !pickupDraft && (
        <p className="hr-calc-admin__empty">
          Нет данных забора. Нажмите «Создать структуру тарифов» или загрузите пикап.xlsx на вкладке «Импорт» (дата версии = поле выше).
        </p>
      )}

      {tab === "pickup" && pickupDraft && (
        <div>
          <h3 className="hr-calc-admin__section-title">Москва</h3>
          <TierTable tiers={pickupDraft.cities.moscow?.tiers ?? []} onChange={(tiers) => setPickupDraft({ ...pickupDraft, cities: { ...pickupDraft.cities, moscow: { ...pickupDraft.cities.moscow, tiers } } })} />
          <h3 className="hr-calc-admin__section-title">Калининград</h3>
          <TierTable tiers={pickupDraft.cities.kaliningrad?.tiers ?? []} onChange={(tiers) => setPickupDraft({ ...pickupDraft, cities: { ...pickupDraft.cities, kaliningrad: { ...pickupDraft.cities.kaliningrad, tiers } } })} />
          <div className="hr-calc-admin__actions">
            <button type="button" className="button-primary" onClick={() => void savePickup("pickup").catch((e) => setError((e as Error).message))}>
              Сохранить версию забора
            </button>
          </div>
        </div>
      )}

      {tab === "last_mile" && !lastMileDraft && (
        <p className="hr-calc-admin__empty">Нет данных последней мили. Импорт xlsx или «Создать структуру тарифов».</p>
      )}

      {tab === "last_mile" && lastMileDraft && (
        <div>
          <h3 className="hr-calc-admin__section-title">Москва</h3>
          <TierTable tiers={lastMileDraft.cities.moscow?.tiers ?? []} onChange={(tiers) => setLastMileDraft({ ...lastMileDraft, cities: { ...lastMileDraft.cities, moscow: { ...lastMileDraft.cities.moscow, tiers } } })} />
          <h3 className="hr-calc-admin__section-title">Калининград</h3>
          <TierTable tiers={lastMileDraft.cities.kaliningrad?.tiers ?? []} onChange={(tiers) => setLastMileDraft({ ...lastMileDraft, cities: { ...lastMileDraft.cities, kaliningrad: { ...lastMileDraft.cities.kaliningrad, tiers } } })} />
          <div className="hr-calc-admin__actions">
            <button type="button" className="button-primary" onClick={() => void savePickup("last_mile").catch((e) => setError((e as Error).message))}>
              Сохранить версию последней мили
            </button>
          </div>
        </div>
      )}

      {tab === "mainline" && sets.filter((s) => s.block === "mainline").length === 0 && (
        <p className="hr-calc-admin__empty">Нет наборов магистрали. Нажмите «Создать структуру тарифов».</p>
      )}

      {tab === "mainline" && sets.filter((s) => s.block === "mainline").length > 0 && (
        <div className="hr-calc-admin-table-wrap">
          <table className="hr-calc-admin-table">
            <thead>
              <tr>
                <th>Набор</th>
                <th>Режим</th>
                <th>Направление</th>
                <th>₽/кг</th>
                <th>Дней</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sets
                .filter((s) => s.block === "mainline")
                .map((s) => {
                  const p = (versionPayload(s) ?? {}) as MainlinePayload;
                  const draft = mainlineDrafts.find((d) => d.direction === p.direction && d.mode === p.mode) ?? p;
                  return (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{p.mode}</td>
                      <td>{p.direction}</td>
                      <td>
                        <input
                          type="number"
                          className="hr-calc-admin-input hr-calc-admin-input--num"
                          value={draft.price_per_kg}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setMainlineDrafts((prev) =>
                              prev.map((m) =>
                                m.direction === p.direction && m.mode === p.mode ? { ...m, price_per_kg: v } : m,
                              ),
                            );
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="hr-calc-admin-input hr-calc-admin-input--num"
                          value={draft.delivery_days}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setMainlineDrafts((prev) =>
                              prev.map((m) =>
                                m.direction === p.direction && m.mode === p.mode ? { ...m, delivery_days: v } : m,
                              ),
                            );
                          }}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="filter-button"
                          onClick={() => {
                            const d = mainlineDrafts.find((m) => m.direction === p.direction && m.mode === p.mode) ?? p;
                            void publish(s.code, d).catch((e) => setError((e as Error).message));
                          }}
                        >
                          Версия
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "extras" && !setByCode.calc_extras && (
        <p className="hr-calc-admin__empty">Набор «Доп. услуги» не создан. Нажмите «Создать структуру тарифов».</p>
      )}

      {tab === "extras" && setByCode.calc_extras && (
        <div>
          {extrasDraft.length === 0 && (
            <p className="hr-calc-admin__empty" style={{ marginBottom: "0.75rem" }}>
              Список пуст — «Создать структуру» добавит стандартные доп. услуги CDEK.
            </p>
          )}
          <div className="hr-calc-admin-extras">
          {extrasDraft.map((ex, i) => {
            const enabled = ex.enabled !== false;
            return (
            <div
              key={`${ex.code}-${i}`}
              className={`hr-calc-admin-extra-row${enabled ? "" : " hr-calc-admin-extra-row--off"}`}
            >
              <label className="haulz-calc-switch" title={enabled ? "Включено" : "Выключено"}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={() => {
                    const next = [...extrasDraft];
                    next[i] = { ...next[i], enabled: !enabled };
                    setExtrasDraft(next);
                  }}
                />
                <span className="haulz-calc-switch__track" />
              </label>
              <input className="hr-calc-admin-input hr-calc-admin-input--code" value={ex.code} readOnly />
              <input
                className="hr-calc-admin-input hr-calc-admin-input--wide"
                value={ex.label}
                onChange={(e) => {
                  const next = [...extrasDraft];
                  next[i] = { ...next[i], label: e.target.value };
                  setExtrasDraft(next);
                }}
              />
              <select
                className="hr-calc-admin-select"
                value={ex.pricing_type}
                onChange={(e) => {
                  const next = [...extrasDraft];
                  next[i] = { ...next[i], pricing_type: e.target.value as ExtraServicePayload["pricing_type"] };
                  setExtrasDraft(next);
                }}
              >
                <option value="fixed">Фикс</option>
                <option value="percent_of_declared_value">%</option>
              </select>
              <input
                type="number"
                className="hr-calc-admin-input hr-calc-admin-input--num"
                placeholder="₽"
                value={ex.amount_rub ?? ""}
                onChange={(e) => {
                  const next = [...extrasDraft];
                  next[i] = { ...next[i], amount_rub: Number(e.target.value) || 0 };
                  setExtrasDraft(next);
                }}
              />
              <input
                type="number"
                className="hr-calc-admin-input hr-calc-admin-input--num"
                placeholder="%"
                value={ex.percent ?? ""}
                onChange={(e) => {
                  const next = [...extrasDraft];
                  next[i] = { ...next[i], percent: Number(e.target.value) || 0 };
                  setExtrasDraft(next);
                }}
              />
              <label className="hr-calc-admin-extra-row__default">
                <input
                  type="checkbox"
                  checked={ex.default_on === true}
                  onChange={(e) => {
                    const next = [...extrasDraft];
                    next[i] = { ...next[i], default_on: e.target.checked };
                    setExtrasDraft(next);
                  }}
                />
                по умолч.
              </label>
              <button
                type="button"
                className="hr-calc-admin-extra-row__delete"
                onClick={() => setExtrasDraft(extrasDraft.filter((_, idx) => idx !== i))}
                aria-label={`Удалить ${ex.label}`}
                title="Удалить"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            );
          })}
          </div>
          <div className="hr-calc-admin__actions">
            <button
              type="button"
              className="button-primary"
              onClick={() => void publish("calc_extras", { services: extrasDraft }).catch((e) => setError((e as Error).message))}
            >
              Сохранить доп. услуги
            </button>
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div>
          <label className="hr-calc-admin__field" style={{ maxWidth: "16rem" }}>
            <span className="hr-calc-admin__label">Коэффициент объёмного веса (кг/м³)</span>
            <input
              type="number"
              className="hr-calc-admin-input"
              value={settingsFactor}
              onChange={(e) => setSettingsFactor(e.target.value)}
            />
          </label>
          <div className="hr-calc-admin__actions">
            <button
              type="button"
              className="button-primary"
              onClick={() =>
                void publish("calc_settings", { volumetric_factor_kg_m3: Number(settingsFactor) || 200 }).catch((e) =>
                  setError((e as Error).message),
                )
              }
            >
              Сохранить настройки
            </button>
          </div>
        </div>
      )}

      {tab === "ring" && (
        <div>
          <p className="hr-calc-admin__hint" style={{ marginBottom: "0.875rem" }}>
            Съезды кольцевой дороги для автоматического расчёта км за МКАД/КАД. МКАД — из файла 1С «Список.MXL» (47 точек). КАД — справочник
            пересечений обхода Калининграда (20 точек); при выгрузке 1С можно заменить импортом.
          </p>
          <div className="hr-calc-admin__actions" style={{ marginTop: 0, marginBottom: "0.875rem" }}>
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                void seedAdminRingExits(adminToken, "seed_kad")
                  .then((r) => {
                    setMessage(`КАД: загружено ${r.count ?? 0} съездов`);
                    setRingCity("kaliningrad");
                    return loadRing();
                  })
                  .catch((e) => setError((e as Error).message));
              }}
            >
              Загрузить КАД (20 съездов)
            </button>
            <button
              type="button"
              className="filter-button"
              onClick={() => {
                void seedAdminRingExits(adminToken, "seed_mkad")
                  .then((r) => {
                    setMessage(`МКАД: загружено ${r.count ?? 0} съездов`);
                    setRingCity("moscow");
                    return loadRing();
                  })
                  .catch((e) => setError((e as Error).message));
              }}
            >
              Загрузить МКАД из Список.MXL
            </button>
            <button
              type="button"
              className="filter-button"
              onClick={() => {
                void seedAdminRingExits(adminToken, "seed_all")
                  .then((r) => {
                    setMessage(`МКАД ${r.moscow ?? 0}, КАД ${r.kaliningrad ?? 0} съездов`);
                    return loadRing();
                  })
                  .catch((e) => setError((e as Error).message));
              }}
            >
              Загрузить оба кольца
            </button>
          </div>
          <div className="hr-calc-admin-subtabs">
            <button type="button" className={ringCity === "moscow" ? "button-primary" : "filter-button"} onClick={() => setRingCity("moscow")}>
              Москва (МКАД) — {ringCity === "moscow" ? ringExits.length : "…"}
            </button>
            <button
              type="button"
              className={ringCity === "kaliningrad" ? "button-primary" : "filter-button"}
              onClick={() => setRingCity("kaliningrad")}
            >
              Калининград (КАД) — {ringCity === "kaliningrad" ? ringExits.length : "…"}
            </button>
          </div>
          {ringExits.length === 0 && (
            <div className="hr-calc-admin-alert hr-calc-admin-alert--warn">
              Нет съездов для {ringCity === "moscow" ? "Москвы" : "Калининграда"}. Нажмите «Загрузить КАД» или «Загрузить МКАД».
            </div>
          )}
          <div className="hr-calc-admin-table-wrap">
            <table className="hr-calc-admin-table">
              <thead>
                <tr>
                  <th>Код</th>
                  <th>Название</th>
                  <th style={{ textAlign: "right" }}>Широта</th>
                  <th style={{ textAlign: "right" }}>Долгота</th>
                  <th style={{ textAlign: "center" }}>Активен</th>
                </tr>
              </thead>
              <tbody>
                {ringExits.map((e) => (
                  <tr key={e.id}>
                    <td>{e.code}</td>
                    <td>{e.name}</td>
                    <td style={{ textAlign: "right" }}>{Number(e.lat).toFixed(6)}</td>
                    <td style={{ textAlign: "right" }}>{Number(e.lon).toFixed(6)}</td>
                    <td style={{ textAlign: "center" }}>{e.active ? "да" : "нет"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="hr-calc-admin__section-title">Добавить точку</h3>
          <RingExitForm
            city={ringCity}
            onSave={async (row) => {
              await saveAdminRingExit(adminToken, row);
              await loadRing();
              setMessage("Съезд сохранён");
            }}
          />
        </div>
      )}

      {tab === "hubs" && (
        <div>
          <div className="hr-calc-admin-table-wrap">
            <table className="hr-calc-admin-table">
              <thead>
                <tr>
                  <th>Код</th>
                  <th>Название</th>
                  <th>Роль</th>
                  <th style={{ textAlign: "right" }}>lat</th>
                  <th style={{ textAlign: "right" }}>lon</th>
                </tr>
              </thead>
              <tbody>
                {hubs.map((h) => (
                  <tr key={h.id}>
                    <td>{h.code}</td>
                    <td>{h.name}</td>
                    <td>{h.role}</td>
                    <td style={{ textAlign: "right" }}>{h.lat}</td>
                    <td style={{ textAlign: "right" }}>{h.lon}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="hr-calc-admin__section-title">Добавить хаб</h3>
          <HubForm
            onSave={async (row) => {
              await saveAdminHub(adminToken, row);
              await loadHubs();
              setMessage("Хаб сохранён");
            }}
          />
        </div>
      )}

      {tab === "history" && (
        <div>
          <p className="hr-calc-admin__hint" style={{ marginTop: 0 }}>
            Здесь видно, какие версии тарифов сохранялись и с какой даты они действуют. Выберите нужный раздел — список
            покажет изменения простым языком, без технических кодов.
          </p>
          <label className="hr-calc-admin__field" style={{ maxWidth: "24rem" }}>
            <span className="hr-calc-admin__label">Раздел тарифов</span>
            <select
              className="hr-calc-admin-select"
              value={historySetId}
              onChange={(e) => setHistorySetId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">— выберите раздел —</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {tariffSetSelectLabel(s)}
                </option>
              ))}
            </select>
          </label>
          {historyLoading && (
            <div className="hr-calc-admin__loading" style={{ marginTop: "0.75rem" }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              Загрузка истории…
            </div>
          )}
          {historySet && historyActive && (
            <div className="hr-calc-admin-history-active" style={{ marginTop: "0.875rem" }}>
              <p className="hr-calc-admin-history-active__title">
                Сейчас действует версия от{" "}
                <strong>{formatTariffDateRu(historyActive.effective_from)}</strong>
                {historyActive.created_by ? ` · сохранил ${historyActive.created_by}` : ""}
              </p>
              <TariffVersionSummary
                tariffCode={historySet.code}
                block={historySet.block}
                payload={historyActive.payload}
              />
            </div>
          )}
          {historySet && historyRows.length > 0 && (
            <div className="hr-calc-admin-table-wrap" style={{ marginTop: "0.875rem" }}>
              <table className="hr-calc-admin-table">
                <thead>
                  <tr>
                    <th>Действует с</th>
                    <th>Кто сохранил</th>
                    <th>Что в версии</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((h) => {
                    const isActive = historyActive?.id === h.id;
                    return (
                      <tr key={h.id} className={isActive ? "hr-calc-admin-history-row--active" : undefined}>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {formatTariffDateRu(h.effective_from)}
                          {isActive && (
                            <span className="hr-calc-admin-history-badge" style={{ marginLeft: "0.5rem" }}>
                              сейчас
                            </span>
                          )}
                        </td>
                        <td>{h.created_by?.trim() || "—"}</td>
                        <td>
                          <TariffVersionSummary
                            tariffCode={historySet.code}
                            block={historySet.block}
                            payload={h.payload}
                          />
                          {h.comment?.trim() && (
                            <p className="hr-calc-admin-history-comment">Комментарий: {h.comment.trim()}</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {historySet && !historyLoading && historyRows.length === 0 && (
            <p className="hr-calc-admin__empty" style={{ marginTop: "0.75rem" }}>
              Для «{tariffSetSelectLabel(historySet)}» пока нет сохранённых версий.
            </p>
          )}
        </div>
      )}

      {tab === "import" && (
        <div className="hr-calc-admin-import">
          <label className="hr-calc-admin__field">
            <span className="hr-calc-admin__label">Тип файла</span>
            <select className="hr-calc-admin-select" value={importKind} onChange={(e) => setImportKind(e.target.value as typeof importKind)}>
              <option value="pickup_xlsx">пикап.xlsx (забор + последняя миля)</option>
              <option value="mkad_mxl">Список.MXL (съезды МКАД)</option>
            </select>
          </label>
          <label className="hr-calc-admin__field">
            <span className="hr-calc-admin__label">Файл</span>
            <input type="file" className="hr-calc-admin-import__file" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
          </label>
          <button
            type="button"
            className="button-primary"
            disabled={!importFile}
            onClick={() => {
              if (!importFile) return;
              void importAdminHaulzFile(adminToken, importKind, importFile, effectiveFrom)
                .then(() => {
                  setMessage(`Импорт выполнен (версия с ${effectiveFrom}). Откройте вкладку «Забор» или «Магистраль».`);
                  return loadSets();
                })
                .catch((e) => setError((e as Error).message));
            }}
          >
            Загрузить
          </button>
          <p className="hr-calc-admin__hint" style={{ margin: 0 }}>
            Или: npx tsx scripts/seed-haulz-calculator.ts (файлы в data/haulz-calculator-seed/)
          </p>
        </div>
      )}

      </div>

      <footer className="hr-calc-admin__footer">
        <button type="button" className="filter-button" onClick={() => void loadSets()} disabled={loading}>
          Обновить всё
        </button>
      </footer>
    </div>
  );
}

function RingExitForm({
  city,
  onSave,
}: {
  city: "moscow" | "kaliningrad";
  onSave: (row: { city_code: typeof city; code: string; name: string; lat: number; lon: number }) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  return (
    <div className="hr-calc-admin-form-row">
      <label className="hr-calc-admin__field">
        <span className="hr-calc-admin__label">Код</span>
        <input className="hr-calc-admin-input" placeholder="KAD_021" value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      <label className="hr-calc-admin__field" style={{ flex: "2 1 12rem" }}>
        <span className="hr-calc-admin__label">Название</span>
        <input className="hr-calc-admin-input" placeholder="Название съезда" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="hr-calc-admin__field">
        <span className="hr-calc-admin__label">Широта</span>
        <input className="hr-calc-admin-input hr-calc-admin-input--num" placeholder="54.71" value={lat} onChange={(e) => setLat(e.target.value)} />
      </label>
      <label className="hr-calc-admin__field">
        <span className="hr-calc-admin__label">Долгота</span>
        <input className="hr-calc-admin-input hr-calc-admin-input--num" placeholder="20.45" value={lon} onChange={(e) => setLon(e.target.value)} />
      </label>
      <button
        type="button"
        className="filter-button"
        onClick={() => {
          void onSave({ city_code: city, code, name, lat: Number(lat), lon: Number(lon) });
        }}
      >
        Добавить
      </button>
    </div>
  );
}

function HubForm({
  onSave,
}: {
  onSave: (row: { code: string; name: string; lat: number; lon: number; role: "moscow" | "kaliningrad" }) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"moscow" | "kaliningrad">("moscow");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  return (
    <div className="hr-calc-admin-form-row">
      <label className="hr-calc-admin__field">
        <span className="hr-calc-admin__label">Код</span>
        <input className="hr-calc-admin-input" placeholder="HUB_MSK" value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      <label className="hr-calc-admin__field" style={{ flex: "2 1 12rem" }}>
        <span className="hr-calc-admin__label">Название</span>
        <input className="hr-calc-admin-input" placeholder="Название хаба" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="hr-calc-admin__field">
        <span className="hr-calc-admin__label">Роль</span>
        <select className="hr-calc-admin-select" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          <option value="moscow">moscow</option>
          <option value="kaliningrad">kaliningrad</option>
        </select>
      </label>
      <label className="hr-calc-admin__field">
        <span className="hr-calc-admin__label">Широта</span>
        <input className="hr-calc-admin-input hr-calc-admin-input--num" placeholder="55.75" value={lat} onChange={(e) => setLat(e.target.value)} />
      </label>
      <label className="hr-calc-admin__field">
        <span className="hr-calc-admin__label">Долгота</span>
        <input className="hr-calc-admin-input hr-calc-admin-input--num" placeholder="37.62" value={lon} onChange={(e) => setLon(e.target.value)} />
      </label>
      <button
        type="button"
        className="filter-button"
        onClick={() => void onSave({ code, name, role, lat: Number(lat), lon: Number(lon) })}
      >
        Добавить хаб
      </button>
    </div>
  );
}

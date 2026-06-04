import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Flex, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import type { ExtraServicePayload, MainlinePayload, PickupMatrixPayload, PickupTier } from "../../../../lib/haulzCalculator/types";
import {
  fetchAdminHaulzCalculatorTariffs,
  fetchAdminHaulzTariffHistory,
  type TariffVersionHistory,
  fetchAdminHubs,
  fetchAdminRingExits,
  importAdminHaulzFile,
  publishAdminHaulzTariffVersion,
  saveAdminHub,
  saveAdminRingExit,
  type AdminHaulzTariffSet,
  type HubRow,
} from "../../../api/client/admin/haulzCalculatorAdmin";

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

function TierTable({ tiers, onChange }: { tiers: PickupTier[]; onChange: (t: PickupTier[]) => void }) {
  return (
    <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
      <table style={{ fontSize: "0.8rem", borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ padding: "0.3rem" }}>Вес max</th>
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
                  <td key={field} style={{ padding: "0.2rem" }}>
                    <input
                      type="number"
                      value={t[field] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? undefined : Number(e.target.value);
                        const next = [...tiers];
                        next[i] = { ...next[i], [field]: v };
                        onChange(next);
                      }}
                      style={{ width: "72px" }}
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
      if (pickup?.active_version?.payload) setPickupDraft(pickup.active_version.payload as PickupMatrixPayload);
      if (lastMile?.active_version?.payload) setLastMileDraft(lastMile.active_version.payload as PickupMatrixPayload);
      if (extras?.active_version?.payload) {
        const p = extras.active_version.payload as { services?: ExtraServicePayload[] };
        setExtrasDraft(p.services ?? []);
      }
      if (settings?.active_version?.payload) {
        const p = settings.active_version.payload as { volumetric_factor_kg_m3?: number };
        setSettingsFactor(String(p.volumetric_factor_kg_m3 ?? 200));
      }
      const ml: MainlinePayload[] = [];
      for (const s of list.filter((x) => x.block === "mainline" && x.active_version?.payload)) {
        const p = s.active_version!.payload as MainlinePayload;
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

  const publish = async (code: string, payload: unknown) => {
    const set = setByCode[code];
    if (!set) throw new Error(`Тариф ${code} не найден`);
    await publishAdminHaulzTariffVersion(adminToken, set.id, effectiveFrom, payload);
    setMessage(`Версия ${code} от ${effectiveFrom} сохранена`);
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
    <div className="w-full">
      <Typography.Headline style={{ marginBottom: "0.5rem" }}>Тарифы калькулятора HAULZ</Typography.Headline>
      <Typography.Body style={{ marginBottom: "0.75rem", fontSize: "0.9rem", opacity: 0.85 }}>
        Версии с датой вступления в силу. Тарифы на {sets[0]?.active_version?.effective_from ?? "—"} (актуальные).
      </Typography.Body>

      <label style={{ fontSize: "0.85rem", marginBottom: "0.75rem", display: "block" }}>
        Новая версия с даты:{" "}
        <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
      </label>

      <div className="hr-calc-admin-tabs">
        {(Object.keys(TAB_LABELS) as AdminTab[]).map((t) => (
          <button key={t} type="button" className={`hr-calc-admin-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {loading && <Loader2 className="w-5 h-5 animate-spin" />}
      {error && <Typography.Body style={{ color: "var(--color-danger, #c00)" }}>{error}</Typography.Body>}
      {message && <Typography.Body style={{ color: "var(--color-success, #059669)", marginBottom: "0.5rem" }}>{message}</Typography.Body>}

      {tab === "pickup" && pickupDraft && (
        <div>
          <Typography.Body style={{ fontWeight: 600 }}>Москва</Typography.Body>
          <TierTable tiers={pickupDraft.cities.moscow?.tiers ?? []} onChange={(tiers) => setPickupDraft({ ...pickupDraft, cities: { ...pickupDraft.cities, moscow: { ...pickupDraft.cities.moscow, tiers } } })} />
          <Typography.Body style={{ fontWeight: 600, marginTop: "1rem" }}>Калининград</Typography.Body>
          <TierTable tiers={pickupDraft.cities.kaliningrad?.tiers ?? []} onChange={(tiers) => setPickupDraft({ ...pickupDraft, cities: { ...pickupDraft.cities, kaliningrad: { ...pickupDraft.cities.kaliningrad, tiers } } })} />
          <button type="button" className="button-primary" style={{ marginTop: "0.75rem" }} onClick={() => void savePickup("pickup").catch((e) => setError((e as Error).message))}>
            Сохранить версию забора
          </button>
        </div>
      )}

      {tab === "last_mile" && lastMileDraft && (
        <div>
          <Typography.Body style={{ fontWeight: 600 }}>Москва</Typography.Body>
          <TierTable tiers={lastMileDraft.cities.moscow?.tiers ?? []} onChange={(tiers) => setLastMileDraft({ ...lastMileDraft, cities: { ...lastMileDraft.cities, moscow: { ...lastMileDraft.cities.moscow, tiers } } })} />
          <Typography.Body style={{ fontWeight: 600, marginTop: "1rem" }}>Калининград</Typography.Body>
          <TierTable tiers={lastMileDraft.cities.kaliningrad?.tiers ?? []} onChange={(tiers) => setLastMileDraft({ ...lastMileDraft, cities: { ...lastMileDraft.cities, kaliningrad: { ...lastMileDraft.cities.kaliningrad, tiers } } })} />
          <button type="button" className="button-primary" style={{ marginTop: "0.75rem" }} onClick={() => void savePickup("last_mile").catch((e) => setError((e as Error).message))}>
            Сохранить версию последней мили
          </button>
        </div>
      )}

      {tab === "mainline" && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ fontSize: "0.85rem", width: "100%", borderCollapse: "collapse" }}>
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
                  const p = (s.active_version?.payload ?? {}) as MainlinePayload;
                  const draft = mainlineDrafts.find((d) => d.direction === p.direction && d.mode === p.mode) ?? p;
                  return (
                    <tr key={s.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                      <td>{s.name}</td>
                      <td>{p.mode}</td>
                      <td>{p.direction}</td>
                      <td>
                        <input
                          type="number"
                          value={draft.price_per_kg}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setMainlineDrafts((prev) =>
                              prev.map((m) =>
                                m.direction === p.direction && m.mode === p.mode ? { ...m, price_per_kg: v } : m,
                              ),
                            );
                          }}
                          style={{ width: 72 }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={draft.delivery_days}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setMainlineDrafts((prev) =>
                              prev.map((m) =>
                                m.direction === p.direction && m.mode === p.mode ? { ...m, delivery_days: v } : m,
                              ),
                            );
                          }}
                          style={{ width: 56 }}
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

      {tab === "extras" && (
        <div>
          {extrasDraft.map((ex, i) => (
            <Flex key={ex.code} gap="0.35rem" wrap="wrap" style={{ marginBottom: "0.5rem", alignItems: "center" }}>
              <input value={ex.code} readOnly style={{ width: 120 }} />
              <input
                value={ex.label}
                onChange={(e) => {
                  const next = [...extrasDraft];
                  next[i] = { ...next[i], label: e.target.value };
                  setExtrasDraft(next);
                }}
                style={{ flex: 1, minWidth: 140 }}
              />
              <select
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
                placeholder="₽"
                value={ex.amount_rub ?? ""}
                onChange={(e) => {
                  const next = [...extrasDraft];
                  next[i] = { ...next[i], amount_rub: Number(e.target.value) || 0 };
                  setExtrasDraft(next);
                }}
                style={{ width: 72 }}
              />
              <input
                type="number"
                placeholder="%"
                value={ex.percent ?? ""}
                onChange={(e) => {
                  const next = [...extrasDraft];
                  next[i] = { ...next[i], percent: Number(e.target.value) || 0 };
                  setExtrasDraft(next);
                }}
                style={{ width: 56 }}
              />
              <label>
                <input
                  type="checkbox"
                  checked={ex.default_on === true}
                  onChange={(e) => {
                    const next = [...extrasDraft];
                    next[i] = { ...next[i], default_on: e.target.checked };
                    setExtrasDraft(next);
                  }}
                />{" "}
                по умолч.
              </label>
            </Flex>
          ))}
          <button
            type="button"
            className="button-primary"
            onClick={() => void publish("calc_extras", { services: extrasDraft }).catch((e) => setError((e as Error).message))}
          >
            Сохранить доп. услуги
          </button>
        </div>
      )}

      {tab === "settings" && (
        <div>
          <label>
            Коэффициент объёмного веса (кг/м³):{" "}
            <input type="number" value={settingsFactor} onChange={(e) => setSettingsFactor(e.target.value)} />
          </label>
          <button
            type="button"
            className="button-primary"
            style={{ marginTop: "0.5rem", display: "block" }}
            onClick={() =>
              void publish("calc_settings", { volumetric_factor_kg_m3: Number(settingsFactor) || 200 }).catch((e) =>
                setError((e as Error).message),
              )
            }
          >
            Сохранить настройки
          </button>
        </div>
      )}

      {tab === "ring" && (
        <div>
          <Flex gap="0.5rem" style={{ marginBottom: "0.5rem" }}>
            <button type="button" className={ringCity === "moscow" ? "button-primary" : "filter-button"} onClick={() => setRingCity("moscow")}>
              Москва (МКАД)
            </button>
            <button type="button" className={ringCity === "kaliningrad" ? "button-primary" : "filter-button"} onClick={() => setRingCity("kaliningrad")}>
              Калининград (КАД)
            </button>
          </Flex>
          <table style={{ fontSize: "0.8rem", width: "100%" }}>
            <thead>
              <tr>
                <th>Код</th>
                <th>Название</th>
                <th>lat</th>
                <th>lon</th>
                <th>активен</th>
              </tr>
            </thead>
            <tbody>
              {ringExits.map((e) => (
                <tr key={e.id}>
                  <td>{e.code}</td>
                  <td>{e.name}</td>
                  <td>{e.lat}</td>
                  <td>{e.lon}</td>
                  <td>{e.active ? "да" : "нет"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Typography.Body style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
            Добавить точку (код, название, координаты):
          </Typography.Body>
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
          <table style={{ fontSize: "0.85rem", width: "100%" }}>
            <thead>
              <tr>
                <th>Код</th>
                <th>Название</th>
                <th>Роль</th>
                <th>lat</th>
                <th>lon</th>
              </tr>
            </thead>
            <tbody>
              {hubs.map((h) => (
                <tr key={h.id}>
                  <td>{h.code}</td>
                  <td>{h.name}</td>
                  <td>{h.role}</td>
                  <td>{h.lat}</td>
                  <td>{h.lon}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <label style={{ fontSize: "0.85rem" }}>
            Тариф:{" "}
            <select
              value={historySetId}
              onChange={(e) => setHistorySetId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">— выберите —</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} ({s.block})
                </option>
              ))}
            </select>
          </label>
          {historyLoading && <Loader2 className="w-5 h-5 animate-spin" style={{ marginTop: "0.5rem" }} />}
          {historyActive && (
            <Typography.Body style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>
              Активная версия: <strong>{historyActive.effective_from}</strong>
              {historyActive.comment ? ` — ${historyActive.comment}` : ""}
            </Typography.Body>
          )}
          {historyRows.length > 0 && (
            <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
              <table style={{ fontSize: "0.8rem", width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "0.35rem" }}>С даты</th>
                    <th>Кем</th>
                    <th>Комментарий</th>
                    <th>Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((h) => (
                    <tr key={h.id} style={{ borderTop: "1px solid #e5e7eb", verticalAlign: "top" }}>
                      <td style={{ padding: "0.35rem", whiteSpace: "nowrap" }}>{h.effective_from}</td>
                      <td style={{ padding: "0.35rem" }}>{h.created_by ?? "—"}</td>
                      <td style={{ padding: "0.35rem" }}>{h.comment ?? "—"}</td>
                      <td style={{ padding: "0.35rem", maxWidth: 420 }}>
                        <pre
                          style={{
                            margin: 0,
                            fontSize: "0.7rem",
                            maxHeight: 120,
                            overflow: "auto",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {JSON.stringify(h.payload, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "import" && (
        <div>
          <select value={importKind} onChange={(e) => setImportKind(e.target.value as typeof importKind)}>
            <option value="pickup_xlsx">пикап.xlsx (забор + последняя миля)</option>
            <option value="mkad_mxl">Список.MXL (съезды МКАД)</option>
          </select>
          <input type="file" style={{ display: "block", margin: "0.5rem 0" }} onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
          <button
            type="button"
            className="button-primary"
            disabled={!importFile}
            onClick={() => {
              if (!importFile) return;
              void importAdminHaulzFile(adminToken, importKind, importFile, effectiveFrom)
                .then(() => {
                  setMessage("Импорт выполнен");
                  return loadSets();
                })
                .catch((e) => setError((e as Error).message));
            }}
          >
            Загрузить
          </button>
          <Typography.Body style={{ marginTop: "0.5rem", fontSize: "0.8rem", opacity: 0.8 }}>
            Или: npx tsx scripts/seed-haulz-calculator.ts (файлы в data/haulz-calculator-seed/)
          </Typography.Body>
        </div>
      )}

      <Flex style={{ marginTop: "1rem" }}>
        <button type="button" className="filter-button" onClick={() => void loadSets()} disabled={loading}>
          Обновить всё
        </button>
      </Flex>
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
    <Flex gap="0.35rem" wrap="wrap" style={{ marginTop: "0.35rem" }}>
      <input placeholder="Код" value={code} onChange={(e) => setCode(e.target.value)} />
      <input placeholder="Название" value={name} onChange={(e) => setName(e.target.value)} style={{ minWidth: 160 }} />
      <input placeholder="lat" value={lat} onChange={(e) => setLat(e.target.value)} style={{ width: 88 }} />
      <input placeholder="lon" value={lon} onChange={(e) => setLon(e.target.value)} style={{ width: 88 }} />
      <button
        type="button"
        className="filter-button"
        onClick={() => {
          void onSave({ city_code: city, code, name, lat: Number(lat), lon: Number(lon) });
        }}
      >
        Добавить
      </button>
    </Flex>
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
    <Flex gap="0.35rem" wrap="wrap" style={{ marginTop: "0.75rem" }}>
      <input placeholder="Код" value={code} onChange={(e) => setCode(e.target.value)} />
      <input placeholder="Название" value={name} onChange={(e) => setName(e.target.value)} />
      <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
        <option value="moscow">moscow</option>
        <option value="kaliningrad">kaliningrad</option>
      </select>
      <input placeholder="lat" value={lat} onChange={(e) => setLat(e.target.value)} style={{ width: 88 }} />
      <input placeholder="lon" value={lon} onChange={(e) => setLon(e.target.value)} style={{ width: 88 }} />
      <button
        type="button"
        className="filter-button"
        onClick={() => void onSave({ code, name, role, lat: Number(lat), lon: Number(lon) })}
      >
        Добавить хаб
      </button>
    </Flex>
  );
}

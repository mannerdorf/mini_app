/**
 * HAULZ — AIS. Поиск судна по MMSI через Marinesia API.
 */
import React, { useState, useCallback, useEffect } from "react";

/** UN/LOCODE → название порта/города (Балтика, Россия) */
const PORT_CODE_TO_NAME: Record<string, string> = {
  RULED: "Санкт-Петербург",
  RUKGD: "Калининград",
  RUBLI: "Балтийск",
  LTKLL: "Клайпеда",
  PLGDN: "Гданьск",
  PLGDY: "Гдыня",
  SEMMA: "Мальмё",
  DKCPH: "Копенгаген",
  DEHAM: "Гамбург",
  FIHEL: "Хельсинки",
  EETLL: "Таллин",
  LVRIX: "Рига",
};

function formatPortDest(code: string): string {
  const upper = String(code ?? "").trim().toUpperCase();
  if (!upper) return "";
  const name = PORT_CODE_TO_NAME[upper];
  return name ? `${name} (${upper})` : upper;
}

const NAV_STATUS_LABELS: Record<number, string> = {
  0: "В движении (двигатель)",
  1: "На якоре",
  2: "Не под управлением",
  3: "Ограниченная манёвренность",
  4: "Ограничена осадкой",
  5: "На причале",
  6: "На мели",
  7: "Рыболовство",
  8: "В движении (парус)",
  9: "Резерв HSC",
  10: "Резерв WIG",
  11: "Буксировка",
  12: "Резерв",
  13: "Резерв",
  14: "AIS-SART",
  15: "Не определено",
};
import { ArrowLeft, Loader2, MapPin } from "lucide-react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";

export function AisStreamPage({ onBack, initialMmsi, onConsumedInitialMmsi }: { onBack: () => void; initialMmsi?: string; onConsumedInitialMmsi?: () => void }) {
  const [ferries, setFerries] = useState<{ id: number; name: string; mmsi: string }[]>([]);
  const [mmsi, setMmsi] = useState(initialMmsi ?? "");
  const [vesselInfo, setVesselInfo] = useState<{
    mmsi: string; name: string; lat: number; lon: number;
    sog?: number; cog?: number; timeUtc?: string;
    dest?: string; eta?: string; status?: number; hdt?: number; draught?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchMarinesia = useCallback(async () => {
    const mmsiTrimmed = mmsi.trim().replace(/\D/g, "");
    if (mmsiTrimmed.length !== 9) {
      setError("Введите MMSI (9 цифр)");
      return;
    }
    setError(null);
    setVesselInfo(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/marinesia-ship?mmsi=${mmsiTrimmed}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Ошибка Marinesia");
        return;
      }
      if (data?.vessel) {
        setVesselInfo(data.vessel);
      } else {
        setError("Судно не найдено");
      }
    } catch (e) {
      setError((e as Error)?.message || "Ошибка запроса");
    } finally {
      setLoading(false);
    }
  }, [mmsi]);

  useEffect(() => {
    fetch("/api/ferries-list")
      .then((res) => res.json())
      .then((data: { ferries?: { id: number; name: string; mmsi: string }[] }) => setFerries(data.ferries || []))
      .catch(() => setFerries([]));
  }, []);

  useEffect(() => {
    const trimmed = (initialMmsi ?? "").trim().replace(/\D/g, "");
    if (trimmed.length !== 9) {
      if (initialMmsi) onConsumedInitialMmsi?.();
      return;
    }
    setMmsi(trimmed);
    setError(null);
    setLoading(true);
    fetch(`/api/marinesia-ship?mmsi=${encodeURIComponent(trimmed)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.vessel) {
          setVesselInfo(data.vessel);
        } else {
          setError("Судно не найдено");
        }
      })
      .catch((e) => setError((e as Error)?.message || "Ошибка запроса"))
      .finally(() => {
        setLoading(false);
        onConsumedInitialMmsi?.();
      });
  }, []); // run once on mount when opened via ETA link

  const mmsiValid = mmsi.trim().replace(/\D/g, "").length === 9;

  return (
    <div className="w-full">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline style={{ fontSize: "1.25rem" }}>AIS — суда</Typography.Headline>
      </Flex>

      <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "0.75rem" }}>
        <Typography.Body style={{ marginBottom: "0.5rem", fontWeight: 600 }}>Номер судна (MMSI)</Typography.Body>
        <Typography.Body style={{ marginBottom: "0.5rem", fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
          Выберите паром из справочника или введите 9-значный MMSI вручную. Данные через Marinesia.
        </Typography.Body>
        {ferries.length > 0 && (
          <div style={{ marginBottom: "0.75rem" }}>
            <label htmlFor="ferry-select" className="visually-hidden">Выберите паром</label>
            <select
              id="ferry-select"
              value={mmsi}
              onChange={(e) => setMmsi(e.target.value)}
              className="admin-form-input"
              style={{ width: "100%", maxWidth: "24rem", padding: "0.5rem 0.75rem", fontSize: "1rem", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-bg-input)", color: "var(--color-text-primary)" }}
            >
              <option value="">— Выберите паром из справочника —</option>
              {ferries.map((f) => (
                <option key={f.id} value={f.mmsi}>
                  {f.name} ({f.mmsi})
                </option>
              ))}
            </select>
          </div>
        )}
        <Input
          className="admin-form-input ais-mmsi-input"
          value={mmsi}
          onChange={(e) => setMmsi(e.target.value.replace(/\D/g, "").slice(0, 9))}
          placeholder="Или введите MMSI вручную, например: 259000420"
          inputMode="numeric"
          style={{ marginBottom: "0.75rem", fontSize: "1.1rem" }}
        />
        <Button
          type="button"
          className="button-primary"
          onClick={fetchMarinesia}
          disabled={!mmsiValid || loading}
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" style={{ marginRight: "0.35rem" }} />}
          Найти судно
        </Button>
        {error && (
          <Typography.Body style={{ marginTop: "0.5rem", color: "var(--color-error)", fontSize: "0.85rem" }}>
            {error}
          </Typography.Body>
        )}
      </Panel>

      {vesselInfo && (
        <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "0.75rem", background: "var(--color-bg-hover)", borderColor: "var(--color-primary)" }}>
          <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem" }}>
            <MapPin className="w-5 h-5" style={{ color: "var(--color-primary)" }} />
            <Typography.Body style={{ fontWeight: 600 }}>Где судно</Typography.Body>
          </Flex>
          <Typography.Body style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" }}>{vesselInfo.name}</Typography.Body>
          <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
            MMSI: {vesselInfo.mmsi}
          </Typography.Body>
          <Typography.Body style={{ fontSize: "1rem", marginBottom: "0.25rem" }}>
            Широта: {vesselInfo.lat.toFixed(6)}, Долгота: {vesselInfo.lon.toFixed(6)}
          </Typography.Body>
          {typeof vesselInfo.sog === "number" && (
            <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
              Скорость: {vesselInfo.sog} узлов
              {typeof vesselInfo.cog === "number" && ` • Курс относительно земли: ${vesselInfo.cog}°`}
              {typeof vesselInfo.hdt === "number" && ` • Истинный курс (нос судна): ${vesselInfo.hdt}°`}
            </Typography.Body>
          )}
          {vesselInfo.dest && (
            <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
              Порт назначения: {formatPortDest(vesselInfo.dest)}
            </Typography.Body>
          )}
          {vesselInfo.eta && (
            <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
              Расчётное время прибытия: {vesselInfo.eta} (UTC)
            </Typography.Body>
          )}
          {typeof vesselInfo.status === "number" && (
            <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
              Статус навигации: {vesselInfo.status} ({NAV_STATUS_LABELS[vesselInfo.status] ?? `код ${vesselInfo.status}`})
            </Typography.Body>
          )}
          {typeof vesselInfo.draught === "number" && (
            <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
              Осадка: {vesselInfo.draught} м
            </Typography.Body>
          )}
          {vesselInfo.timeUtc && (
            <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.35rem" }}>
              {vesselInfo.timeUtc}
            </Typography.Body>
          )}
          <a
            href={`https://www.google.com/maps?q=${vesselInfo.lat},${vesselInfo.lon}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-block", marginTop: "0.5rem", fontSize: "0.9rem", color: "var(--color-primary-blue)" }}
          >
            Открыть на карте →
          </a>
        </Panel>
      )}

    </div>
  );
}

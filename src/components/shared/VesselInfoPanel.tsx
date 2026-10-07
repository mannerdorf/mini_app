import React from "react";
import { MapPin } from "lucide-react";
import { Flex, Panel, Typography } from "@maxhub/max-ui";
import type { MarinesiaVessel } from "../../api/client/ais";

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

export function formatPortDest(code: string): string {
  const upper = String(code ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!upper) return "";
  const name = PORT_CODE_TO_NAME[upper];
  return name ? `${name} (${upper})` : upper;
}

export const NAV_STATUS_LABELS: Record<number, string> = {
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
export function VesselInfoPanel({ vesselInfo }: { vesselInfo: MarinesiaVessel }) {
  return (
        <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "0.75rem", background: "var(--color-bg-hover)", borderColor: "var(--color-primary)" }}>
          <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem" }}>
            <MapPin className="w-5 h-5" style={{ color: "var(--color-primary)" }} />
            <Typography.Body style={{ display: "block", fontWeight: 600 }}>Где судно</Typography.Body>
          </Flex>
          <Typography.Body style={{ display: "block", fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" }}>{vesselInfo.name}</Typography.Body>
          <Typography.Body style={{ display: "block", fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
            MMSI: {vesselInfo.mmsi}
          </Typography.Body>
          <Typography.Body style={{ display: "block", fontSize: "1rem", marginBottom: "0.25rem" }}>
            Широта: {vesselInfo.lat.toFixed(6)}, Долгота: {vesselInfo.lon.toFixed(6)}
          </Typography.Body>
          {typeof vesselInfo.sog === "number" && <Typography.Body style={{ display: "block", fontSize: "0.9rem", marginBottom: "0.25rem" }}>Скорость: {vesselInfo.sog} узлов</Typography.Body>}
          {typeof vesselInfo.cog === "number" && <Typography.Body style={{ display: "block", fontSize: "0.9rem", marginBottom: "0.25rem" }}>Курс относительно земли: {vesselInfo.cog}°</Typography.Body>}
          {typeof vesselInfo.hdt === "number" && <Typography.Body style={{ display: "block", fontSize: "0.9rem", marginBottom: "0.25rem" }}>Истинный курс (нос судна): {vesselInfo.hdt}°</Typography.Body>}
          {vesselInfo.dest && (
            <Typography.Body style={{ display: "block", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
              Порт назначения: {formatPortDest(vesselInfo.dest)}
            </Typography.Body>
          )}
          {vesselInfo.eta && (
            <Typography.Body style={{ display: "block", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
              Расчётное время прибытия: {vesselInfo.eta} (UTC)
            </Typography.Body>
          )}
          {typeof vesselInfo.status === "number" && (
            <Typography.Body style={{ display: "block", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
              Статус навигации: {vesselInfo.status} ({NAV_STATUS_LABELS[vesselInfo.status] ?? `код ${vesselInfo.status}`})
            </Typography.Body>
          )}
          {typeof vesselInfo.draught === "number" && (
            <Typography.Body style={{ display: "block", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
              Осадка: {vesselInfo.draught} м
            </Typography.Body>
          )}
          {vesselInfo.timeUtc && (
            <Typography.Body style={{ display: "block", fontSize: "0.8rem", color: "var(--color-text-secondary)", marginTop: "0.35rem" }}>
              Последнее обновление (UTC): {vesselInfo.timeUtc}
            </Typography.Body>
          )}
          {Number.isFinite(vesselInfo.lat) && Number.isFinite(vesselInfo.lon) && (
            <iframe
              title={`Паром ${vesselInfo.name} на карте`}
              src={`https://maps.google.com/maps?q=${vesselInfo.lat},${vesselInfo.lon}&z=9&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer"
              style={{ display: 'block', width: '100%', height: 360, border: 0, borderRadius: 12, marginTop: '0.75rem' }}
            />
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
  );
}

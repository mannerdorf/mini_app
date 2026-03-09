/**
 * HAULZ — AIS стрим судов (AISstream.io).
 * Поиск по номеру судна (MMSI), формирование запроса: bbox, messageTypes.
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import { ArrowLeft, Ship, Play, Square, Loader2, MapPin } from "lucide-react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";

const DEFAULT_BBOX = "[[[55.0, 19.5], [55.2, 20.0]], [[54.6, 20.0], [54.9, 20.6]]]";
const DEFAULT_MESSAGE_TYPES = "PositionReport,ShipStaticData";

function tryParseBbox(s: string): unknown {
  try {
    const parsed = JSON.parse(s) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Извлекает координаты и название из AIS-сообщения */
function extractVesselInfo(msg: unknown): { mmsi: string; name: string; lat: number; lon: number; sog?: number; cog?: number; timeUtc?: string } | null {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;
  const meta = m.MetaData || m.Metadata as Record<string, unknown> | undefined;
  const pr = (m.Message as Record<string, unknown>)?.["PositionReport"] as Record<string, unknown> | undefined;
  const lat = meta?.latitude ?? meta?.Latitude ?? pr?.Latitude;
  const lon = meta?.longitude ?? meta?.Longitude ?? pr?.Longitude;
  const mmsi = String(meta?.MMSI ?? pr?.UserID ?? "").trim();
  if (typeof lat !== "number" || typeof lon !== "number" || !mmsi) return null;
  const name = String(meta?.ShipName ?? "").trim() || `Судно ${mmsi}`;
  const sog = typeof pr?.Sog === "number" ? pr.Sog : undefined;
  const cog = typeof pr?.Cog === "number" ? pr.Cog : undefined;
  const timeUtc = typeof meta?.time_utc === "string" ? meta.time_utc : undefined;
  return { mmsi, name, lat, lon, sog, cog, timeUtc };
}

export function AisStreamPage({ onBack }: { onBack: () => void }) {
  const [mmsi, setMmsi] = useState("");
  const [bbox, setBbox] = useState(DEFAULT_BBOX);
  const [messageTypes, setMessageTypes] = useState(DEFAULT_MESSAGE_TYPES);
  const [streaming, setStreaming] = useState(false);
  const [streamMode, setStreamMode] = useState<"mmsi" | "bbox">("bbox");
  const [vesselInfo, setVesselInfo] = useState<{ mmsi: string; name: string; lat: number; lon: number; sog?: number; cog?: number; timeUtc?: string } | null>(null);
  const [events, setEvents] = useState<{ type: string; data: unknown; ts: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const stopStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStreaming(false);
  }, []);

  const startStream = useCallback(() => {
    const mmsiTrimmed = mmsi.trim().replace(/\D/g, "");
    const useMmsi = mmsiTrimmed.length === 9;

    if (!useMmsi) {
      const bboxParsed = tryParseBbox(bbox.trim());
      if (!bboxParsed) {
        setError("Введите MMSI (9 цифр) или исправьте bbox (JSON)");
        return;
      }
    }

    setError(null);
    setEvents([]);
    setVesselInfo(null);
    stopStream();

    const params = new URLSearchParams();
    if (useMmsi) params.set("mmsi", mmsiTrimmed);
    else params.set("bbox", bbox.trim());
    params.set("messageTypes", messageTypes.trim() || DEFAULT_MESSAGE_TYPES);

    setStreamMode(useMmsi ? "mmsi" : "bbox");

    const url = `/api/ais-stream?${params.toString()}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;
    setStreaming(true);

    es.addEventListener("meta", (e) => {
      try {
        const data = e.data ? JSON.parse(e.data) : {};
        setEvents((prev) => [...prev.slice(-99), { type: "meta", data, ts: Date.now() }]);
      } catch {
        setEvents((prev) => [...prev.slice(-99), { type: "meta", data: e.data, ts: Date.now() }]);
      }
    });

    es.addEventListener("ais", (e) => {
      try {
        const data = e.data ? JSON.parse(e.data) : {};
        const info = extractVesselInfo(data);
        if (info) setVesselInfo(info);
        setEvents((prev) => [...prev.slice(-99), { type: "ais", data, ts: Date.now() }]);
      } catch {
        setEvents((prev) => [...prev.slice(-99), { type: "ais", data: e.data, ts: Date.now() }]);
      }
    });

    es.addEventListener("error", (e) => {
      try {
        const data = (e as MessageEvent).data ? JSON.parse((e as MessageEvent).data) : { error: "Connection error" };
        setError(String(data?.error ?? data));
        setEvents((prev) => [...prev.slice(-99), { type: "error", data, ts: Date.now() }]);
      } catch {
        setEvents((prev) => [...prev.slice(-99), { type: "error", data: (e as MessageEvent).data, ts: Date.now() }]);
      }
      stopStream();
    });

    es.addEventListener("info", (e) => {
      try {
        const data = e.data ? JSON.parse(e.data) : {};
        setEvents((prev) => [...prev.slice(-99), { type: "info", data, ts: Date.now() }]);
      } catch {
        setEvents((prev) => [...prev.slice(-99), { type: "info", data: e.data, ts: Date.now() }]);
      }
    });

    es.onerror = () => {
      setError("Соединение прервано");
      stopStream();
    };
  }, [mmsi, bbox, messageTypes, stopStream]);

  useEffect(() => () => stopStream(), [stopStream]);

  const mmsiValid = mmsi.trim().replace(/\D/g, "").length === 9;
  const bboxValid = tryParseBbox(bbox.trim()) !== null;
  const canStart = mmsiValid || (!mmsi.trim() && bboxValid);

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
          Введите 9-значный MMSI судна, чтобы узнать, где оно находится
        </Typography.Body>
        <Input
          value={mmsi}
          onChange={(e) => setMmsi(e.target.value.replace(/\D/g, "").slice(0, 9))}
          placeholder="Например: 259000420"
          inputMode="numeric"
          style={{ marginBottom: "0.75rem", fontSize: "1.1rem" }}
        />
        <Flex align="center" gap="0.5rem" wrap="wrap">
          {streaming ? (
            <Button type="button" className="filter-button" onClick={stopStream}>
              <Square className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              Остановить
            </Button>
          ) : (
            <Button
              type="button"
              className="button-primary"
              onClick={startStream}
              disabled={!canStart}
            >
              <Play className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              {mmsiValid ? "Найти судно" : "Подключиться"}
            </Button>
          )}
        </Flex>
        {error && (
          <Typography.Body style={{ marginTop: "0.5rem", color: "var(--color-error)", fontSize: "0.85rem" }}>
            {error}
          </Typography.Body>
        )}
        <Button
          type="button"
          className="filter-button"
          style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}
          onClick={() => setShowAdvanced((p) => !p)}
        >
          {showAdvanced ? "Скрыть" : "Расширенные параметры"}
        </Button>
        {showAdvanced && (
          <>
            <Typography.Body style={{ marginTop: "0.75rem", marginBottom: "0.35rem", fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
              bbox (если MMSI не указан)
            </Typography.Body>
            <Input
              value={bbox}
              onChange={(e) => setBbox(e.target.value)}
              placeholder={DEFAULT_BBOX}
              style={{ marginBottom: "0.5rem", fontFamily: "monospace", fontSize: "0.8rem" }}
            />
            <Typography.Body style={{ marginBottom: "0.35rem", fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
              messageTypes
            </Typography.Body>
            <Input
              value={messageTypes}
              onChange={(e) => setMessageTypes(e.target.value)}
              placeholder="PositionReport,ShipStaticData"
              style={{ marginBottom: "0.5rem" }}
            />
          </>
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
              {typeof vesselInfo.cog === "number" && ` • Курс: ${vesselInfo.cog}°`}
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

      {streaming && (
        <Flex align="center" gap="0.35rem" style={{ marginBottom: "0.5rem" }}>
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--color-primary)" }} />
          <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
            Стрим активен
            {streamMode === "mmsi" ? " — поиск по MMSI (весь мир)" : " — по зоне"}
          </Typography.Body>
        </Flex>
      )}

      <Panel className="cargo-card" style={{ padding: "1rem", maxHeight: "50vh", overflowY: "auto" }}>
        <Flex align="center" gap="0.5rem" style={{ marginBottom: "0.5rem" }}>
          <Ship className="w-5 h-5" style={{ color: "var(--color-primary)" }} />
          <Typography.Body style={{ fontWeight: 600 }}>События</Typography.Body>
        </Flex>
        {events.length === 0 ? (
          <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
            Нажмите «Подключиться» и сюда появятся события AIS.
          </Typography.Body>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {events.map((ev, i) => (
              <div
                key={`${ev.ts}-${i}`}
                style={{
                  padding: "0.5rem",
                  borderRadius: 8,
                  background: ev.type === "error" ? "rgba(239,68,68,0.1)" : "var(--color-bg-hover)",
                  fontSize: "0.8rem",
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                }}
              >
                <span style={{ fontWeight: 600, color: ev.type === "error" ? "var(--color-error)" : "var(--color-primary)" }}>
                  [{ev.type}]
                </span>{" "}
                {typeof ev.data === "object" && ev.data !== null
                  ? JSON.stringify(ev.data)
                  : String(ev.data)}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

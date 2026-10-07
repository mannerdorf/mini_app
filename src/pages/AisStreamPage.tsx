/**
 * HAULZ — AIS. Поиск судна по MMSI через Marinesia API.
 */
import React, { useState, useCallback, useEffect } from "react";

import { ArrowLeft, Loader2 } from "lucide-react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import { VesselInfoPanel } from "../components/shared/VesselInfoPanel";
import { fetchFerriesList, fetchMarinesiaShip } from "../api/client/ais";

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
      const { ok, vessel, error: apiError } = await fetchMarinesiaShip(mmsiTrimmed);
      if (!ok) {
        setError(apiError || "Ошибка Marinesia");
        return;
      }
      if (vessel) {
        setVesselInfo(vessel);
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
    fetchFerriesList().then(setFerries).catch(() => setFerries([]));
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
    fetchMarinesiaShip(trimmed)
      .then(({ vessel }) => {
        if (vessel) {
          setVesselInfo(vessel);
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

      {vesselInfo && <VesselInfoPanel vesselInfo={vesselInfo} />}

    </div>
  );
}

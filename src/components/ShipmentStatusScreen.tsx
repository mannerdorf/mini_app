import React, { useMemo } from "react";
import { motion } from "motion/react";
import {
  Check,
  Clock3,
  Info,
  Loader2,
  MapPin,
  PackageCheck,
  Ruler,
  ShieldCheck,
  Truck,
  Warehouse,
} from "lucide-react";
import { formatTimelineDate } from "../lib/dateUtils";
import type { PerevozkaTimelineStep } from "../types";

type TrackingStepStatus = "completed" | "current" | "upcoming";

type TrackingStep = {
  id: number;
  title: string;
  date: string;
  status: TrackingStepStatus;
  outOfSla?: boolean;
};

export type ShipmentStatusPanelProps = {
  steps: PerevozkaTimelineStep[];
  fromCity: string;
  toCity: string;
  totalHours?: number | null;
  loading?: boolean;
  error?: string | null;
  /** Встроенный блок в модалке (без полноэкранного фона) */
  embedded?: boolean;
  stepOutOfSla?: (index: number) => boolean;
};

function deriveStepStatuses(steps: PerevozkaTimelineStep[]): TrackingStepStatus[] {
  let lastDateIdx = -1;
  steps.forEach((s, i) => {
    if (s.date) lastDateIdx = i;
  });
  const deliveredIdx = steps.findIndex((s) => s.label === "Доставлена");
  const isFullyDelivered = deliveredIdx >= 0 && Boolean(steps[deliveredIdx]?.date);

  return steps.map((_, i) => {
    const step = steps[i];
    if (!step.date) return "upcoming";
    if (isFullyDelivered) return "completed";
    if (i === lastDateIdx) return "current";
    return "completed";
  });
}

function iconForLabel(label: string): React.ElementType {
  const lower = label.toLowerCase();
  if (lower.includes("информация")) return Info;
  if (lower.startsWith("получена в")) return MapPin;
  if (lower.includes("измерен")) return Ruler;
  if (lower.includes("консолидац")) return ShieldCheck;
  if (lower.includes("загружена")) return Warehouse;
  if (lower.includes("отправлен")) return Truck;
  if (lower.startsWith("прибыла в")) return Warehouse;
  if (lower.includes("запланирован")) return Truck;
  if (lower.includes("доставлен")) return PackageCheck;
  return Clock3;
}

function RouteMap({ fromCity, toCity, stepCount }: { fromCity: string; toCity: string; stepCount: number }) {
  const progress = stepCount <= 1 ? 0.35 : Math.min(0.92, 0.2 + (stepCount / 9) * 0.72);

  return (
    <div className="shipment-status-route">
      <div className="shipment-status-route__bg" aria-hidden />
      <svg className="shipment-status-route__decor" viewBox="0 0 390 150" aria-hidden>
        <path
          d="M19 98 C49 80 84 88 116 62 C149 36 181 50 209 39 C248 23 278 56 318 42 C346 33 363 53 381 35"
          fill="none"
          stroke="rgba(148,163,184,0.45)"
          strokeWidth="28"
          strokeLinecap="round"
        />
      </svg>
      <div className="shipment-status-route__canvas">
        <span className="shipment-status-route__city shipment-status-route__city--from">{fromCity}</span>
        <span className="shipment-status-route__city shipment-status-route__city--to">{toCity}</span>

        <svg className="shipment-status-route__path" viewBox="0 0 390 154" aria-label={`Маршрут ${fromCity} ${toCity}`}>
          <defs>
            <linearGradient id="haulzRouteGradient" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#2D5BFF" />
              <stop offset="55%" stopColor="#22C55E" />
              <stop offset="78%" stopColor="#FACC15" />
              <stop offset="100%" stopColor="#94A3B8" />
            </linearGradient>
          </defs>
          <path
            d="M38 77 C78 54 108 85 143 65 C181 43 209 84 247 66 C289 45 318 70 351 87"
            fill="none"
            stroke="rgba(148,163,184,0.35)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M38 77 C78 54 108 85 143 65 C181 43 209 84 247 66 C289 45 318 70 351 87"
            fill="none"
            stroke="url(#haulzRouteGradient)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="8 8"
            pathLength={1}
            strokeDashoffset={1 - progress}
          />
          {[
            { x: 38, y: 77, c: "#2D5BFF", r: 9 },
            { x: 94, y: 66, c: "#22C55E", r: 6 },
            { x: 139, y: 66, c: "#86EFAC", r: 5 },
            { x: 181, y: 61, c: "#22C55E", r: 7 },
            { x: 220, y: 72, c: "#FACC15", r: 10 },
            { x: 269, y: 60, c: "#94A3B8", r: 7 },
            { x: 313, y: 72, c: "#94A3B8", r: 5 },
            { x: 351, y: 87, c: "#94A3B8", r: 9 },
          ].map((point, index) => (
            <g key={index}>
              <circle cx={point.x} cy={point.y} r={point.r + 5} fill={point.c} opacity="0.18" />
              <circle cx={point.x} cy={point.y} r={point.r} fill={point.c} stroke="#fff" strokeWidth="2" />
            </g>
          ))}
          <motion.circle
            r="4"
            fill="#2D5BFF"
            initial={{ offsetDistance: "0%" }}
            animate={{ offsetDistance: ["0%", `${Math.round(progress * 100)}%`, "0%"] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
            style={{
              offsetPath: "path('M38 77 C78 54 108 85 143 65 C181 43 209 84 247 66 C289 45 318 70 351 87')",
            }}
          />
        </svg>
      </div>
    </div>
  );
}

function StepIcon({ step }: { step: TrackingStep }) {
  const Icon = step.status === "current" ? Truck : step.status === "completed" ? Check : iconForLabel(step.title);
  const className = [
    "shipment-status-step-icon",
    step.outOfSla ? "shipment-status-step-icon--sla" : "",
    step.status === "current" ? "shipment-status-step-icon--current" : "",
    step.status === "completed" ? "shipment-status-step-icon--completed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <Icon strokeWidth={step.status === "completed" ? 3 : 2.4} />
    </div>
  );
}

function TrackingStepRow({ step, index, total }: { step: TrackingStep; index: number; total: number }) {
  const rowClass = [
    "shipment-status-step",
    step.status === "current" ? "shipment-status-step--current" : "",
    step.status === "upcoming" ? "shipment-status-step--upcoming" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <motion.div
      className={rowClass}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 + index * 0.04, duration: 0.28, ease: "easeOut" }}
    >
      {index < total - 1 && (
        <span
          className={[
            "shipment-status-step__connector",
            step.status === "upcoming" ? "" : "shipment-status-step__connector--active",
          ].join(" ")}
          aria-hidden
        />
      )}
      <StepIcon step={step} />
      <div className="shipment-status-step__body">
        <div
          className={[
            "shipment-status-step__title",
            step.outOfSla ? "shipment-status-step__title--sla" : "",
          ].join(" ")}
        >
          {step.title}
        </div>
      </div>
      <div
        className={[
          "shipment-status-step__date",
          step.outOfSla ? "shipment-status-step__date--sla" : "",
        ].join(" ")}
      >
        {step.date || "—"}
      </div>
    </motion.div>
  );
}

export function ShipmentStatusPanel({
  steps,
  fromCity,
  toCity,
  totalHours,
  loading,
  error,
  embedded = true,
  stepOutOfSla,
}: ShipmentStatusPanelProps) {
  const trackingSteps = useMemo((): TrackingStep[] => {
    const statuses = deriveStepStatuses(steps);
    return steps.map((step, index) => ({
      id: index + 1,
      title: step.label,
      date: step.date ? formatTimelineDate(step.date) : "",
      status: statuses[index],
      outOfSla: stepOutOfSla?.(index),
    }));
  }, [steps, stepOutOfSla]);

  const completedCount = trackingSteps.filter((s) => s.status === "completed" || s.status === "current").length;

  const inner = (
    <motion.section
      className={[
        "shipment-status-panel",
        embedded ? "shipment-status-panel--embedded" : "shipment-status-panel--standalone",
      ].join(" ")}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="shipment-status-panel__head">
        <div className="shipment-status-panel__titles">
          <p className="shipment-status-panel__title">Статусы перевозки</p>
          <p className="shipment-status-panel__subtitle">
            Маршрут {fromCity} → {toCity}
          </p>
        </div>
        {!loading && trackingSteps.length > 0 && (
          <div className="shipment-status-panel__counter">
            {completedCount} / {trackingSteps.length} этапов
          </div>
        )}
      </div>

      {loading && (
        <div className="shipment-status-panel__loading">
          <Loader2 className="shipment-status-panel__loading-icon" />
          <span>Загрузка статусов…</span>
        </div>
      )}

      {error && !loading && <p className="shipment-status-panel__error">{error}</p>}

      {!loading && !error && trackingSteps.length > 0 && (
        <>
          <RouteMap fromCity={fromCity} toCity={toCity} stepCount={completedCount} />

          <div className="shipment-status-steps">
            {trackingSteps.map((step, index) => (
              <React.Fragment key={`${step.id}-${step.title}`}>
                <TrackingStepRow step={step} index={index} total={trackingSteps.length} />
                {index < trackingSteps.length - 1 && <div className="shipment-status-step__divider" />}
              </React.Fragment>
            ))}
          </div>

          {totalHours != null && (
            <motion.div
              className="shipment-status-total"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.3, ease: "easeOut" }}
            >
              <div className="shipment-status-total__left">
                <div className="shipment-status-total__clock">
                  <Clock3 />
                </div>
                <div className="shipment-status-total__label">Итого время в пути</div>
              </div>
              <div className="shipment-status-total__value">
                {totalHours} <span className="shipment-status-total__unit">ч</span>
              </div>
            </motion.div>
          )}
        </>
      )}
    </motion.section>
  );

  if (embedded) return inner;

  return <div className="shipment-status-screen">{inner}</div>;
}

/** Демо-экран с мок-данными (для превью / ?shipmentStatus=1) */
export function ShipmentStatusScreen() {
  const mockSteps: PerevozkaTimelineStep[] = [
    { label: "Получена информация", date: "2026-04-25" },
    { label: "Получена в MSK", date: "2026-04-25" },
    { label: "Измерена", date: "2026-04-25" },
    { label: "Консолидация", date: "2026-04-25" },
    { label: "Загружена в ТС", date: "2026-04-25" },
    { label: "Отправлена", date: "2026-04-25" },
    { label: "Прибыла в KGD", date: undefined },
    { label: "Запланирована доставка", date: undefined },
    { label: "Доставлена", date: undefined },
  ];
  return (
    <ShipmentStatusPanel
      steps={mockSteps}
      fromCity="MSK"
      toCity="KGD"
      totalHours={170}
      embedded={false}
    />
  );
}

export default ShipmentStatusScreen;

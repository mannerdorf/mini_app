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

const ROUTE_PATH_MSK_KGD =
  "M 83 42 C 70 48, 55 54, 42 56 S 25 58, 17 61";

const ROUTE_WAYPOINTS = [
  { x: 70, y: 48, color: "#2D5BFF" },
  { x: 58, y: 52, color: "#22C55E" },
  { x: 48, y: 55, color: "#22C55E" },
  { x: 36, y: 58, color: "#86EFAC" },
  { x: 26, y: 60, color: "#FACC15" },
] as const;

const MAP_MSK = { label: "MSK", left: 83, top: 42 };
const MAP_KGD = { label: "KGD", left: 17, top: 61 };

function routeProgressFromSteps(stepCount: number): number {
  if (stepCount <= 0) return 0.14;
  return Math.min(0.98, 0.18 + (stepCount / 9) * 0.8);
}

function RouteMap({ fromCity, toCity, stepCount }: { fromCity: string; toCity: string; stepCount: number }) {
  const uid = React.useId().replace(/:/g, "");
  const gradientId = `haulzRouteGradient-${uid}`;
  const glowBlueId = `haulzGlowBlue-${uid}`;
  const glowYellowId = `haulzGlowYellow-${uid}`;
  const progress = routeProgressFromSteps(stepCount);
  const progressPct = Math.round(progress * 100);

  return (
    <div className="shipment-status-route">
      <div
        className="shipment-status-route__canvas"
        role="img"
        aria-label={`Маршрут ${fromCity} — ${toCity}`}
      >
        <img
          src="/map-light.png"
          alt=""
          className="shipment-status-route__map shipment-status-route__map--light"
          draggable={false}
        />
        <img
          src="/map-dark.png"
          alt=""
          className="shipment-status-route__map shipment-status-route__map--dark"
          draggable={false}
        />

        <svg
          className="shipment-status-route__overlay"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id={gradientId} x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2D5BFF" />
              <stop offset="55%" stopColor="#22C55E" />
              <stop offset="100%" stopColor="#FACC15" />
            </linearGradient>
            <filter id={glowBlueId} x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="1.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id={glowYellowId} x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="1.1" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path
            d={ROUTE_PATH_MSK_KGD}
            fill="none"
            stroke="rgba(148,163,184,0.35)"
            strokeWidth="1"
            strokeDasharray="3 3"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={ROUTE_PATH_MSK_KGD}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="1.2"
            strokeDasharray="3 3"
            strokeLinecap="round"
            pathLength={1}
            strokeDashoffset={1 - progress}
            vectorEffect="non-scaling-stroke"
          />

          {ROUTE_WAYPOINTS.map((point, index) => (
            <g key={index} filter={index < 3 ? `url(#${glowBlueId})` : `url(#${glowYellowId})`}>
              <circle cx={point.x} cy={point.y} r="1.8" fill={point.color} opacity="0.35" />
              <circle cx={point.x} cy={point.y} r="0.9" fill={point.color} />
            </g>
          ))}

          <motion.circle
            r="1.1"
            fill="#2D5BFF"
            filter={`url(#${glowBlueId})`}
            initial={{ offsetDistance: "0%" }}
            animate={{ offsetDistance: ["0%", `${progressPct}%`, "0%"] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
            style={{ offsetPath: `path('${ROUTE_PATH_MSK_KGD}')` }}
          />
        </svg>

        <div
          className="shipment-status-route__pin shipment-status-route__pin--msk"
          style={{ left: `${MAP_MSK.left}%`, top: `${MAP_MSK.top}%` }}
        >
          <span className="shipment-status-route__pin-dot shipment-status-route__pin-dot--blue" />
          <span className="shipment-status-route__pin-label">{MAP_MSK.label}</span>
        </div>
        <div
          className="shipment-status-route__pin shipment-status-route__pin--kgd"
          style={{ left: `${MAP_KGD.left}%`, top: `${MAP_KGD.top}%` }}
        >
          <span className="shipment-status-route__pin-dot shipment-status-route__pin-dot--yellow" />
          <span className="shipment-status-route__pin-label">{MAP_KGD.label}</span>
        </div>
      </div>
    </div>
  );
}

function StepIcon({ step }: { step: TrackingStep }) {
  const Icon = step.status === "current" ? Truck : step.status === "completed" ? Check : iconForLabel(step.title);
  const className = [
    "shipment-status-step-icon",
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

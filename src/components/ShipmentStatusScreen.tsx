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
    <div className="relative mt-4 overflow-hidden rounded-[22px] border border-white/10 bg-[#071428]/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(45,91,255,0.22),transparent_30%),radial-gradient(circle_at_78%_66%,rgba(250,204,21,0.18),transparent_26%)]" />
      <svg className="absolute inset-0 h-full w-full opacity-[0.23]" viewBox="0 0 390 150" aria-hidden>
        <path
          d="M19 98 C49 80 84 88 116 62 C149 36 181 50 209 39 C248 23 278 56 318 42 C346 33 363 53 381 35"
          fill="none"
          stroke="rgba(148,163,184,0.32)"
          strokeWidth="32"
          strokeLinecap="round"
        />
      </svg>
      <div className="relative h-[120px] sm:h-[134px]">
        <div className="absolute left-3 top-5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold tracking-wide text-slate-100 shadow-lg backdrop-blur">
          {fromCity}
        </div>
        <div className="absolute bottom-5 right-3 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold tracking-wide text-slate-100 shadow-lg backdrop-blur">
          {toCity}
        </div>

        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 390 154" aria-label={`Маршрут ${fromCity} ${toCity}`}>
          <defs>
            <linearGradient id="haulzRouteGradient" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#2D5BFF" />
              <stop offset="55%" stopColor="#22C55E" />
              <stop offset="78%" stopColor="#FACC15" />
              <stop offset="100%" stopColor="#64748B" />
            </linearGradient>
            <filter id="haulzRouteGlow" x="-40%" y="-80%" width="180%" height="260%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d="M38 77 C78 54 108 85 143 65 C181 43 209 84 247 66 C289 45 318 70 351 87"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
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
            filter="url(#haulzRouteGlow)"
            pathLength={1}
            strokeDashoffset={1 - progress}
          />
          {[
            { x: 38, y: 77, c: "#2D5BFF", r: 9 },
            { x: 94, y: 66, c: "#22C55E", r: 6 },
            { x: 139, y: 66, c: "#A7F3D0", r: 5 },
            { x: 181, y: 61, c: "#22C55E", r: 7 },
            { x: 220, y: 72, c: "#FACC15", r: 10 },
            { x: 269, y: 60, c: "#94A3B8", r: 7 },
            { x: 313, y: 72, c: "#94A3B8", r: 5 },
            { x: 351, y: 87, c: "#94A3B8", r: 9 },
          ].map((point, index) => (
            <g key={index}>
              <circle cx={point.x} cy={point.y} r={point.r + 7} fill={point.c} opacity="0.14" />
              <circle cx={point.x} cy={point.y} r={point.r} fill={point.c} stroke="rgba(255,255,255,0.72)" strokeWidth="2" />
            </g>
          ))}
          <motion.circle
            r="4"
            fill="#E0F2FE"
            filter="url(#haulzRouteGlow)"
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
  const base =
    "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-lg";
  if (step.outOfSla) {
    return (
      <div className={`${base} border-red-300/60 bg-red-500/90 text-white shadow-red-500/30`}>
        <Icon className="h-4 w-4" strokeWidth={2.4} />
      </div>
    );
  }
  if (step.status === "current") {
    return (
      <motion.div
        className={`${base} border-yellow-200/70 bg-yellow-400 text-slate-950 shadow-yellow-400/30`}
        animate={{
          boxShadow: [
            "0 0 0 rgba(250,204,21,0)",
            "0 0 24px rgba(250,204,21,0.45)",
            "0 0 0 rgba(250,204,21,0)",
          ],
        }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Icon className="h-4 w-4" strokeWidth={2.4} />
      </motion.div>
    );
  }
  if (step.status === "completed") {
    return (
      <div className={`${base} border-blue-200/50 bg-[#2D5BFF] text-white shadow-blue-500/30`}>
        <Icon className="h-4 w-4" strokeWidth={3} />
      </div>
    );
  }
  return (
    <div className={`${base} border-white/10 bg-slate-700/50 text-slate-300 shadow-black/20`}>
      <Icon className="h-4 w-4 opacity-75" strokeWidth={2.2} />
    </div>
  );
}

function TrackingStepRow({ step, index, total }: { step: TrackingStep; index: number; total: number }) {
  const isCurrent = step.status === "current";
  const isUpcoming = step.status === "upcoming";

  return (
    <motion.div
      className={[
        "group relative grid w-full grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition",
        isCurrent
          ? "border border-yellow-300/35 bg-yellow-400/[0.08] shadow-[inset_4px_0_0_rgba(250,204,21,0.95),inset_-4px_0_0_rgba(250,204,21,0.45),0_0_24px_rgba(250,204,21,0.12)]"
          : "border border-transparent hover:bg-white/[0.04]",
      ].join(" ")}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 + index * 0.04, duration: 0.32, ease: "easeOut" }}
    >
      {index < total - 1 && (
        <span
          className={[
            "absolute left-[1.72rem] top-[2.6rem] h-[calc(100%-1.2rem)] w-px",
            step.status === "upcoming" ? "bg-slate-600/55" : "bg-gradient-to-b from-[#2D5BFF] via-emerald-400 to-emerald-500",
          ].join(" ")}
          aria-hidden
        />
      )}
      <StepIcon step={step} />
      <div className="min-w-0">
        <div
          className={[
            "truncate text-[0.88rem] font-semibold tracking-[-0.01em]",
            step.outOfSla ? "text-red-300" : isCurrent ? "text-white" : isUpcoming ? "text-slate-300/80" : "text-slate-50",
          ].join(" ")}
        >
          {step.title}
        </div>
      </div>
      <div
        className={[
          "whitespace-nowrap text-xs font-medium tabular-nums sm:text-sm",
          step.outOfSla ? "text-red-300" : isCurrent ? "text-yellow-300" : isUpcoming ? "text-slate-400/80" : "text-slate-400",
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
        "w-full overflow-hidden rounded-[20px] border border-white/10 bg-slate-900/55 p-3 shadow-[0_16px_48px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl sm:p-4",
        embedded ? "relative" : "mx-auto max-w-[430px]",
      ].join(" ")}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_50%_0%,rgba(45,91,255,0.24),transparent_62%)]" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold tracking-[-0.03em] text-slate-50 sm:text-[1.2rem]">Статусы перевозки</p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400 sm:text-xs">
            Маршрут {fromCity} → {toCity}
          </p>
        </div>
        {!loading && trackingSteps.length > 0 && (
          <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.08] px-2.5 py-1 text-xs font-bold text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl sm:px-3 sm:py-1.5 sm:text-sm">
            {completedCount} / {trackingSteps.length} этапов
          </div>
        )}
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 py-6 text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin text-[#2D5BFF]" />
          <span className="text-sm">Загрузка статусов…</span>
        </div>
      )}

      {error && !loading && (
        <p className="mt-4 text-sm text-slate-400">{error}</p>
      )}

      {!loading && !error && trackingSteps.length > 0 && (
        <>
          <RouteMap fromCity={fromCity} toCity={toCity} stepCount={completedCount} />

          <div className="mt-3 rounded-[18px] border border-white/10 bg-white/[0.055] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:mt-4 sm:rounded-[22px] sm:p-2">
            {trackingSteps.map((step, index) => (
              <React.Fragment key={`${step.id}-${step.title}`}>
                <TrackingStepRow step={step} index={index} total={trackingSteps.length} />
                {index < trackingSteps.length - 1 && <div className="ml-[3.4rem] h-px bg-white/[0.07]" />}
              </React.Fragment>
            ))}
          </div>

          {totalHours != null && (
            <motion.div
              className="mt-4 flex items-center justify-between rounded-[18px] border border-[#2D5BFF]/70 bg-gradient-to-br from-[#123D92]/70 via-[#0D285E]/75 to-[#071B3C]/90 px-3 py-3 shadow-[0_0_28px_rgba(45,91,255,0.22),inset_0_1px_0_rgba(255,255,255,0.12)] sm:px-4 sm:py-4"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.35, ease: "easeOut" }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#2D5BFF]/60 bg-[#2D5BFF]/15 text-sky-300">
                  <Clock3 className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                <div className="truncate text-sm font-semibold tracking-[-0.02em] text-slate-100 sm:text-base">
                  Итого время в пути
                </div>
              </div>
              <div className="ml-3 text-2xl font-black leading-none tracking-[-0.05em] text-white sm:text-[2rem]">
                {totalHours} <span className="text-lg font-extrabold text-slate-200 sm:text-xl">ч</span>
              </div>
            </motion.div>
          )}
        </>
      )}
    </motion.section>
  );

  if (embedded) return inner;

  return (
    <div className="min-h-screen w-full bg-[#06101f] px-3 py-5 text-white [font-family:Inter,ui-sans-serif,system-ui,sans-serif]">
      {inner}
    </div>
  );
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

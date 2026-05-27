import React from "react";
import { motion } from "motion/react";
import {
  Check,
  Clock3,
  Info,
  MapPin,
  PackageCheck,
  Ruler,
  ShieldCheck,
  Truck,
  Warehouse,
} from "lucide-react";

type TrackingStepStatus = "completed" | "current" | "upcoming";

type TrackingStep = {
  id: number;
  title: string;
  date: string;
  status: TrackingStepStatus;
};

const trackingSteps: TrackingStep[] = [
  { id: 1, title: "Получена информация", date: "25.04.2026", status: "completed" },
  { id: 2, title: "Получена в MSK", date: "25.04.2026", status: "completed" },
  { id: 3, title: "Измерена", date: "25.04.2026", status: "completed" },
  { id: 4, title: "Консолидация", date: "25.04.2026", status: "completed" },
  { id: 5, title: "Загружена в ТС", date: "25.04.2026", status: "completed" },
  { id: 6, title: "Отправлена", date: "25.04.2026", status: "current" },
  { id: 7, title: "Прибыла в KGD", date: "02.05.2026", status: "upcoming" },
  { id: 8, title: "Запланирована доставка", date: "02.05.2026", status: "upcoming" },
  { id: 9, title: "Доставлена", date: "02.05.2026", status: "upcoming" },
];

const stepIconById: Record<number, React.ElementType> = {
  1: Info,
  2: MapPin,
  3: Ruler,
  4: ShieldCheck,
  5: Warehouse,
  6: Truck,
  7: Warehouse,
  8: Truck,
  9: PackageCheck,
};

const completedCount = trackingSteps.filter((step) => step.status === "completed" || step.status === "current").length;

function RouteMap() {
  return (
    <div className="relative mt-5 overflow-hidden rounded-[22px] border border-white/10 bg-[#071428]/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(45,91,255,0.22),transparent_30%),radial-gradient(circle_at_78%_66%,rgba(250,204,21,0.18),transparent_26%)]" />
      <svg className="absolute inset-0 h-full w-full opacity-[0.23]" viewBox="0 0 390 150" aria-hidden>
        <path
          d="M19 98 C49 80 84 88 116 62 C149 36 181 50 209 39 C248 23 278 56 318 42 C346 33 363 53 381 35"
          fill="none"
          stroke="rgba(148,163,184,0.32)"
          strokeWidth="32"
          strokeLinecap="round"
        />
        <path
          d="M28 115 C76 80 97 117 136 82 C178 45 211 99 250 65 C287 35 322 88 368 54"
          fill="none"
          stroke="rgba(148,163,184,0.22)"
          strokeWidth="22"
          strokeLinecap="round"
        />
      </svg>
      <div className="relative h-[154px]">
        <div className="absolute left-5 top-7 rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wide text-slate-100 shadow-lg backdrop-blur">
          MSK
        </div>
        <div className="absolute bottom-7 right-4 rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wide text-slate-100 shadow-lg backdrop-blur">
          KGD
        </div>

        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 390 154" aria-label="Маршрут MSK KGD">
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
          />
          {[
            { x: 38, y: 77, c: "#2D5BFF", r: 9 },
            { x: 94, y: 66, c: "#22C55E", r: 6 },
            { x: 139, y: 66, c: "#A7F3D0", r: 5 },
            { x: 181, y: 61, c: "#22C55E", r: 7 },
            { x: 220, y: 72, c: "#22C55E", r: 10 },
            { x: 269, y: 60, c: "#FACC15", r: 7 },
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
            animate={{ offsetDistance: ["0%", "76%", "0%"] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
            style={{
              offsetPath:
                "path('M38 77 C78 54 108 85 143 65 C181 43 209 84 247 66 C289 45 318 70 351 87')",
            }}
          />
        </svg>
      </div>
    </div>
  );
}

function StepIcon({ step }: { step: TrackingStep }) {
  const Icon = step.status === "current" ? Truck : step.status === "completed" ? Check : stepIconById[step.id] ?? Clock3;
  const base =
    "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border shadow-lg";
  if (step.status === "current") {
    return (
      <motion.div
        className={`${base} border-yellow-200/70 bg-yellow-400 text-slate-950 shadow-yellow-400/30`}
        animate={{ boxShadow: ["0 0 0 rgba(250,204,21,0)", "0 0 24px rgba(250,204,21,0.45)", "0 0 0 rgba(250,204,21,0)"] }}
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

function TrackingStepRow({ step, index }: { step: TrackingStep; index: number }) {
  const isCurrent = step.status === "current";
  const isUpcoming = step.status === "upcoming";

  return (
    <motion.button
      type="button"
      className={[
        "group relative grid w-full grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-3 py-3 text-left transition",
        isCurrent
          ? "border border-yellow-300/35 bg-yellow-400/[0.08] shadow-[inset_4px_0_0_rgba(250,204,21,0.95),inset_-4px_0_0_rgba(250,204,21,0.45),0_0_24px_rgba(250,204,21,0.12)]"
          : "border border-transparent hover:bg-white/[0.04]",
      ].join(" ")}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 + index * 0.055, duration: 0.36, ease: "easeOut" }}
      whileTap={{ scale: 0.985 }}
    >
      {index < trackingSteps.length - 1 && (
        <span
          className={[
            "absolute left-[1.72rem] top-[2.85rem] h-[calc(100%-1.35rem)] w-px",
            step.status === "upcoming" ? "bg-slate-600/55" : "bg-gradient-to-b from-[#2D5BFF] via-emerald-400 to-emerald-500",
          ].join(" ")}
          aria-hidden
        />
      )}
      <StepIcon step={step} />
      <div className="min-w-0">
        <div
          className={[
            "truncate text-[0.95rem] font-semibold tracking-[-0.01em]",
            isCurrent ? "text-white" : isUpcoming ? "text-slate-300/80" : "text-slate-50",
          ].join(" ")}
        >
          {step.title}
        </div>
      </div>
      <div
        className={[
          "whitespace-nowrap text-sm font-medium tabular-nums",
          isCurrent ? "text-yellow-300" : isUpcoming ? "text-slate-400/80" : "text-slate-400",
        ].join(" ")}
      >
        {step.date}
      </div>
    </motion.button>
  );
}

export function ShipmentStatusScreen() {
  return (
    <div className="min-h-screen w-full bg-[#06101f] px-3 py-5 text-white [font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif]">
      <motion.section
        className="mx-auto w-full max-w-[430px] overflow-hidden rounded-[24px] border border-white/10 bg-slate-900/55 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-18px_60px_rgba(45,91,255,0.08)] backdrop-blur-2xl"
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.48, ease: "easeOut" }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_50%_0%,rgba(45,91,255,0.24),transparent_62%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <p className="text-[1.35rem] font-bold tracking-[-0.03em] text-slate-50">Статусы перевозки</p>
            <p className="mt-1 text-xs font-medium text-slate-400">Маршрут MSK → KGD</p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-sm font-bold text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl">
            {completedCount} / {trackingSteps.length} этапов
          </div>
        </div>

        <RouteMap />

        <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.055] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_42px_rgba(0,0,0,0.24)] backdrop-blur-xl">
          {trackingSteps.map((step, index) => (
            <React.Fragment key={step.id}>
              <TrackingStepRow step={step} index={index} />
              {index < trackingSteps.length - 1 && <div className="ml-[3.4rem] h-px bg-white/[0.07]" />}
            </React.Fragment>
          ))}
        </div>

        <motion.div
          className="mt-5 flex items-center justify-between rounded-[20px] border border-[#2D5BFF]/70 bg-gradient-to-br from-[#123D92]/70 via-[#0D285E]/75 to-[#071B3C]/90 px-4 py-4 shadow-[0_0_32px_rgba(45,91,255,0.26),inset_0_1px_0_rgba(255,255,255,0.12)]"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.42, ease: "easeOut" }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#2D5BFF]/60 bg-[#2D5BFF]/15 text-sky-300 shadow-[0_0_22px_rgba(45,91,255,0.28)]">
              <Clock3 className="h-5 w-5" />
            </div>
            <div className="truncate text-base font-semibold tracking-[-0.02em] text-slate-100">Итого время в пути</div>
          </div>
          <div className="ml-4 text-[2rem] font-black leading-none tracking-[-0.05em] text-white">
            170 <span className="text-xl font-extrabold text-slate-200">ч</span>
          </div>
        </motion.div>
      </motion.section>
    </div>
  );
}

export default ShipmentStatusScreen;

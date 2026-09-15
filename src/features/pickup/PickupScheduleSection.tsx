import React, { useMemo } from "react";
import {
  expandPickupScheduleDates,
  PICKUP_WEEKDAY_LABELS,
  type PickupScheduleMode,
  type PickupSchedulePattern,
} from "../../../lib/pickup/pickupSchedule";
import { Field } from "./Forms";

export type PickupScheduleUiState = {
  mode: PickupScheduleMode;
  pattern: PickupSchedulePattern;
  weekdays: number[];
  until: string;
  extraDates: string[];
  dateDraft: string;
};

export function defaultPickupScheduleUiState(): PickupScheduleUiState {
  return {
    mode: "once",
    pattern: "weekdays",
    weekdays: [1, 2, 3, 4, 5],
    until: "",
    extraDates: [],
    dateDraft: "",
  };
}

export function pickupScheduleUiToApi(
  state: PickupScheduleUiState,
  startDate: string,
): Record<string, unknown> | undefined {
  if (state.mode === "once") return { mode: "once" };
  if (state.pattern === "dates") {
    const dates = [
      startDate,
      ...state.extraDates.filter((d) => d && d !== startDate),
    ];
    return { mode: "periodic", pattern: "dates", dates };
  }
  return {
    mode: "periodic",
    pattern: "weekdays",
    until: state.until,
    weekdays: state.weekdays,
  };
}

type Props = {
  startDate: string;
  state: PickupScheduleUiState;
  onChange: React.Dispatch<React.SetStateAction<PickupScheduleUiState>>;
  disabled?: boolean;
};

export function PickupScheduleSection({
  startDate,
  state,
  onChange,
  disabled = false,
}: Props) {
  const preview = useMemo(() => {
    if (state.mode === "once") return { count: 1, dates: [startDate] };
    try {
      const api = pickupScheduleUiToApi(state, startDate);
      const dates = expandPickupScheduleDates({
        mode: "periodic",
        pattern: api.pattern as PickupSchedulePattern,
        startDate,
        until: String(api.until ?? ""),
        weekdays: api.weekdays as number[] | undefined,
        dates: api.dates as string[] | undefined,
      });
      return { count: dates.length, dates };
    } catch {
      return { count: 0, dates: [] as string[] };
    }
  }, [state, startDate]);

  const toggleWeekday = (iso: number) => {
    onChange((prev) => {
      const has = prev.weekdays.includes(iso);
      const weekdays = has
        ? prev.weekdays.filter((d) => d !== iso)
        : [...prev.weekdays, iso].sort((a, b) => a - b);
      return { ...prev, weekdays };
    });
  };

  return (
    <section className="pk-panel pk-schedule">
      <h3>График забора</h3>
      {disabled && (
        <p className="pk-hint">
          График задаётся только при создании нового забора. Эту запись можно
          перенести на другую дату в поле «Дата пикапа».
        </p>
      )}
      <div
        className="haulz-calc-segment pk-schedule__mode"
        role="tablist"
        aria-label="Тип графика"
      >
        {(
          [
            ["once", "Разовая"],
            ["periodic", "Периодическая"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            disabled={disabled}
            aria-selected={state.mode === id}
            className={`haulz-calc-segment__btn${state.mode === id ? " haulz-calc-segment__btn--active" : ""}`}
            onClick={() => onChange((p) => ({ ...p, mode: id }))}
          >
            {label}
          </button>
        ))}
      </div>

      {state.mode === "periodic" && !disabled && (
        <>
          <div
            className="haulz-calc-segment pk-schedule__pattern"
            role="tablist"
            aria-label="Периодичность"
          >
            {(
              [
                ["weekdays", "Дни недели"],
                ["dates", "Конкретные даты"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={state.pattern === id}
                className={`haulz-calc-segment__btn${state.pattern === id ? " haulz-calc-segment__btn--active" : ""}`}
                onClick={() => onChange((p) => ({ ...p, pattern: id }))}
              >
                {label}
              </button>
            ))}
          </div>

          {state.pattern === "weekdays" ? (
            <>
              <p className="pk-hint">
                От даты пикапа ({startDate}) до выбранного окончания — заборы в
                отмеченные дни недели.
              </p>
              <div className="pk-schedule__weekdays" role="group" aria-label="Дни недели">
                {PICKUP_WEEKDAY_LABELS.map(({ iso, short }) => (
                  <button
                    key={iso}
                    type="button"
                    className={`pk-schedule__day${state.weekdays.includes(iso) ? " pk-selected" : ""}`}
                    aria-pressed={state.weekdays.includes(iso)}
                    onClick={() => toggleWeekday(iso)}
                  >
                    {short}
                  </button>
                ))}
              </div>
              <Field
                label="Период по"
                type="date"
                value={state.until}
                onChange={(v) => onChange((p) => ({ ...p, until: v }))}
                required
              />
            </>
          ) : (
            <>
              <p className="pk-hint">
                Дата пикапа выше всегда входит в серию. Добавьте другие даты
                ниже.
              </p>
              <div className="pk-actions pk-schedule__add-date">
                <Field
                  label="Добавить дату"
                  type="date"
                  value={state.dateDraft}
                  onChange={(v) => onChange((p) => ({ ...p, dateDraft: v }))}
                />
                <button
                  type="button"
                  disabled={!state.dateDraft}
                  onClick={() =>
                    onChange((p) => {
                      const d = p.dateDraft.trim();
                      if (!d || d === startDate || p.extraDates.includes(d)) {
                        return { ...p, dateDraft: "" };
                      }
                      return {
                        ...p,
                        extraDates: [...p.extraDates, d].sort(),
                        dateDraft: "",
                      };
                    })
                  }
                >
                  Добавить
                </button>
              </div>
              {!!state.extraDates.length && (
                <ul className="pk-schedule__date-list">
                  <li>
                    {startDate} <span className="pk-muted">(дата пикапа)</span>
                  </li>
                  {state.extraDates.map((d) => (
                    <li key={d}>
                      {d}
                      <button
                        type="button"
                        className="pk-link-btn"
                        onClick={() =>
                          onChange((p) => ({
                            ...p,
                            extraDates: p.extraDates.filter((x) => x !== d),
                          }))
                        }
                      >
                        Удалить
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {state.mode === "periodic" && preview.count > 0 && (
        <p className="pk-notice" role="status">
          Будет создано заборов: <strong>{preview.count}</strong>
          {preview.count <= 8
            ? ` — ${preview.dates.join(", ")}`
            : ` — с ${preview.dates[0]} по ${preview.dates[preview.count - 1]}`}
        </p>
      )}
    </section>
  );
}

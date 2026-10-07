import React, { useEffect, useRef, useState } from "react";
import type { TmsCargo, PlanOptions, PackageGroup } from "./model";
import { packageGroups, packageProblem } from "./packing3d";
export function PackageEditor({
  cargo,
  options,
  onSave,
  onClose,
}: {
  cargo: TmsCargo;
  options: PlanOptions;
  onSave: (g: PackageGroup[]) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [groups, setGroups] = useState(() => {
    const { groups, estimated } = packageGroups(cargo, options);
    // An assumed compression limit must never silently become a verified one.
    return structuredClone(groups).map((g) =>
      estimated ? { ...g, stackable: false, maxTopLoad: 0 } : g,
    );
  });
  const [confirmed, setConfirmed] = useState(
    !packageGroups(cargo, options).estimated,
  );
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const update = (i: number, p: Partial<PackageGroup>) =>
    setGroups((gs) => gs.map((g, j) => (j === i ? { ...g, ...p } : g)));
  const problem = groups.length
    ? packageProblem(cargo, {
        ...options,
        packages: { ...options.packages, [cargo.id]: groups },
      })
    : "Добавьте хотя бы одну группу мест";
  const weight = groups.reduce((s, g) => s + g.count * g.weight, 0),
    volume = groups.reduce(
      (s, g) => s + g.count * g.length * g.width * g.height,
      0,
    );
  return (
    <dialog
      ref={dialog}
      className="tms-package-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tms-package-content">
        <div className="tms-section-heading">
          <div>
            <h2>Грузовые места · {cargo.number}</h2>
            <p>{cargo.customer}</p>
          </div>
          <button aria-label="Закрыть габариты" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="tms-muted">
          Одна строка — одинаковые места. Разные размеры или масса — отдельная
          строка. Для палет укажите полные габариты и массу вместе с грузом.
        </p>
        {!confirmed && (
          <p className="tms-notice">
            Значения рассчитаны из общих веса и объёма. Замените их фактическими
            замерами и подтвердите ниже.
          </p>
        )}
        {groups.map((g, i) => (
          <fieldset key={i} className="tms-package-group">
            <legend>Группа {i + 1}</legend>
            <div className="tms-package-fields">
              {(
                [
                  ["count", "Количество", 1],
                  ["length", "Длина, м", 0.01],
                  ["width", "Ширина, м", 0.01],
                  ["height", "Высота, м", 0.01],
                  ["weight", "Масса места, кг", 0.1],
                  ["maxTopLoad", "Допустимо сверху, кг", 0.1],
                ] as const
              ).map(([key, label, step]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    aria-label={`${label}, группа ${i + 1}`}
                    min={key === "maxTopLoad" ? 0 : step}
                    step={step}
                    value={Number.isFinite(g[key]) ? g[key] : ""}
                    onChange={(e) =>
                      update(i, {
                        [key]: e.target.value === "" ? NaN : +e.target.value,
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="tms-package-flags">
              {(
                [
                  ["pallet", "Палета"],
                  ["floorOnly", "Только на полу"],
                  ["stackable", "Можно ставить коробки сверху"],
                  ["rotate", "Разворот на 90° по полу"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={!!g[key]}
                    onChange={(e) => update(i, { [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
              {g.pallet && (
                <label>
                  <input type="checkbox" checked={!!g.palletStacking}
                    onChange={(e) => update(i, { palletStacking: e.target.checked })} />
                  Разрешена укладка палета на палету
                </label>
              )}
              <button
                onClick={() => setGroups(groups.filter((_, j) => j !== i))}
              >
                Удалить группу
              </button>
            </div>
            <small className="tms-muted">
              Плотность:{" "}
              {Number.isFinite(g.weight / (g.length * g.width * g.height))
                ? Math.round(g.weight / (g.length * g.width * g.height))
                : "—"}{" "}
              кг/м³. {g.pallet ? (g.palletStacking ? "Палета на палету — при разрешении обеих групп и снятом запрете «Только на полу». " : "Палета на палету запрещена; коробки сверху — по отдельному разрешению. ") : ""}
              {!g.stackable || !g.maxTopLoad
                ? "Верхняя поверхность закрыта для других грузов."
                : "Суммарная масса всех верхних ярусов ограничена указанной нагрузкой."}
            </small>
          </fieldset>
        ))}
        <button
          onClick={() =>
            setGroups([
              ...groups,
              {
                count: 1,
                length: 1,
                width: 0.8,
                height: 0.5,
                weight: 0,
                pallet: false,
                floorOnly: false,
                stackable: false,
                maxTopLoad: 0,
                rotate: true,
              },
            ])
          }
        >
          + Группа мест
        </button>
        <div className="tms-notice">
          Масса мест: {Number.isFinite(weight) ? weight.toFixed(1) : "—"} /{" "}
          {cargo.weight} кг · Геометрический объём:{" "}
          {Number.isFinite(volume) ? volume.toFixed(2) : "—"} м³ · По данным
          перевозки: {cargo.volume} м³. Для вместимости используем больший
          объём.
        </div>
        <label className="tms-package-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />{" "}
          Габариты, масса и условия штабелирования проверены
        </label>
        {problem && (
          <p role="alert" className="tms-problem">
            {problem}
          </p>
        )}
        <div className="tms-package-footer">
          <button onClick={onClose}>Отмена</button>
          <button
            className="tms-primary"
            disabled={!!problem || !confirmed}
            onClick={() => {
              onSave(groups);
              onClose();
            }}
          >
            Применить
          </button>
        </div>
      </div>
    </dialog>
  );
}

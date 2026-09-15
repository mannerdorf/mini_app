import React, { useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { TapSwitch } from "../../components/TapSwitch";
import type {
  PickupSiteChecklistId,
  PickupSiteInstructionsState,
} from "../../../lib/pickup/jobSiteInstructions";

type Props = {
  state: PickupSiteInstructionsState;
  onChange: (next: PickupSiteInstructionsState) => void;
};

export function PickupInstructionChecklistField({ state, onChange }: Props) {
  const dragId = useRef<PickupSiteChecklistId | null>(null);
  const [dragOver, setDragOver] = useState<PickupSiteChecklistId | null>(null);

  const byId = new Map(state.items.map((i) => [i.id, i]));

  const reorder = (from: PickupSiteChecklistId, to: PickupSiteChecklistId) => {
    if (from === to) return;
    const order = [...state.order];
    const fromIdx = order.indexOf(from);
    const toIdx = order.indexOf(to);
    if (fromIdx < 0 || toIdx < 0) return;
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, from);
    onChange({ ...state, order });
  };

  const toggle = (id: PickupSiteChecklistId) => {
    onChange({
      ...state,
      items: state.items.map((i) =>
        i.id === id ? { ...i, enabled: !i.enabled } : i,
      ),
    });
  };

  return (
    <div className="pk-instruction-checklist">
      <p className="pk-instruction-checklist__title">
        Въезд, ориентир, пропуск, доверенность, предварительный звонок
      </p>
      <p className="pk-hint">
        Включите нужное переключателями. Порядок строк — перетаскиванием (важно для
        водителя).
      </p>
      <ul className="pk-instruction-checklist__list">
        {state.order.map((id) => {
          const item = byId.get(id);
          if (!item) return null;
          return (
            <li
              key={id}
              className={`pk-instruction-checklist__row${
                dragOver === id ? " pk-instruction-checklist__row--over" : ""
              }${item.enabled ? " pk-instruction-checklist__row--on" : ""}`}
              draggable
              onDragStart={() => {
                dragId.current = id;
              }}
              onDragEnd={() => {
                dragId.current = null;
                setDragOver(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(id);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragId.current;
                if (from) reorder(from, id);
                dragId.current = null;
                setDragOver(null);
              }}
            >
              <span className="pk-instruction-checklist__drag" aria-hidden>
                <GripVertical className="w-4 h-4" />
              </span>
              <TapSwitch
                checked={item.enabled}
                onToggle={() => toggle(id)}
                aria-label={`${item.enabled ? "Выключить" : "Включить"}: ${item.label}`}
              />
              <span className="pk-instruction-checklist__label">{item.label}</span>
            </li>
          );
        })}
      </ul>
      <label className="pk-field">
        <span>Дополнительно (текст для водителя)</span>
        <textarea
          rows={3}
          value={state.note}
          placeholder="Уточнения: въезд, пропуск, кого спросить на КПП…"
          onChange={(e) => onChange({ ...state, note: e.target.value })}
        />
      </label>
    </div>
  );
}

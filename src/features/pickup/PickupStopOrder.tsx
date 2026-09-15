import React, { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, LockKeyhole } from "lucide-react";
import type { Job, Route } from "../../../lib/pickup/model";
import { statusLabels } from "../../../lib/pickup/model";
import { movePendingStop } from "./operations";

const fingerprint = (route: Route, jobs: Job[]) =>
  `${route.version}:${jobs.map((j) => `${j.id}:${j.version}:${j.status}`).join(",")}`;
export function PickupStopOrder({
  route,
  jobs,
  disabled,
  busy,
  error,
  onSave,
}: {
  route: Route;
  jobs: Job[];
  disabled: boolean;
  busy: boolean;
  error: string;
  onSave: (ids: string[], version: number) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={
          disabled || jobs.filter((j) => j.status === "pending").length < 2
        }
        onClick={() => setEditing(true)}
      >
        <GripVertical size={18} /> Изменить порядок точек
      </button>
      {editing && (
        <OrderDialog
          route={route}
          jobs={jobs}
          disabled={disabled}
          busy={busy}
          error={error}
          onSave={onSave}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
function OrderDialog({
  route,
  jobs,
  disabled,
  busy,
  error,
  onSave,
  onClose,
}: {
  route: Route;
  jobs: Job[];
  disabled: boolean;
  busy: boolean;
  error: string;
  onSave: (ids: string[], version: number) => Promise<boolean>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    list = useRef<HTMLOListElement>(null);
  const base = useRef({
    signature: fingerprint(route, jobs),
    version: route.version,
    ids: jobs.map((j) => j.id),
  });
  const [ordered, setOrdered] = useState(jobs);
  const [drag, setDrag] = useState<{
    id: string;
    target: string | null;
  } | null>(null);
  const pointer = useRef<{
    id: string;
    x: number;
    y: number;
    target: string | null;
  } | null>(null);
  const [message, setMessage] = useState("");
  const conflict = fingerprint(route, jobs) !== base.current.signature;
  const blocked = disabled || busy || conflict;
  const changed = ordered.some((j, i) => j.id !== base.current.ids[i]);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const move = (id: string, target: string) => {
    const ids = movePendingStop(ordered, id, target);
    if (!ids || blocked) return;
    setOrdered(ids.map((x) => ordered.find((j) => j.id === x)!));
    setMessage(
      `Точка перемещена на позицию ${ids.indexOf(id) + 1}. Сохраните порядок.`,
    );
  };
  const cancelDrag = () => {
    pointer.current = null;
    setDrag(null);
  };
  // Pointer capture supports touch, pen and mouse. Only the handle prevents page scrolling.
  useEffect(() => {
    if (!drag || blocked) {
      pointer.current = null;
      return;
    }
    let frame = 0;
    const tick = () => {
      const p = pointer.current,
        root = list.current;
      if (!p || !root) return;
      const bounds = root.getBoundingClientRect();
      if (p.y < bounds.top + 48) root.scrollTop -= 9;
      else if (p.y > bounds.bottom - 48) root.scrollTop += 9;
      const row = document
        .elementFromPoint(p.x, p.y)
        ?.closest<HTMLElement>("[data-order-id]");
      const target =
        row && root.contains(row) ? (row.dataset.orderId ?? null) : null;
      p.target =
        target && movePendingStop(ordered, p.id, target) ? target : null;
      setDrag((prev) =>
        prev && prev.target !== p.target
          ? { id: p.id, target: p.target }
          : prev,
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [drag?.id, blocked, ordered]);
  return (
    <dialog
      ref={dialog}
      className="pk-publish-dialog pk-order-dialog"
      aria-label="Порядок точек маршрута"
      onClose={onClose}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else cancelDrag();
      }}
    >
      <header>
        <h2>Порядок точек</h2>
        <p className="pk-hint">
          Тяните за ручку ⠿ и отпустите над нужной точкой. Можно использовать
          стрелки. Начатые точки и склад закреплены.
        </p>
      </header>
      {conflict && (
        <p className="pk-warning" role="alert">
          Маршрут обновился. Закройте окно и откройте заново, чтобы учесть
          изменения.
        </p>
      )}
      <ol ref={list} className="pk-order-list">
        {ordered.map((j, i) => {
          const fixed = j.status !== "pending";
          return (
            <li
              key={j.id}
              data-order-id={j.id}
              className={`${fixed ? "pk-order-fixed" : ""} ${drag?.id === j.id ? "pk-order-dragging" : ""} ${drag?.target === j.id ? "pk-order-target" : ""}`}
            >
              <button
                type="button"
                className="pk-order-grip"
                disabled={fixed || blocked}
                aria-label={`Перетащить: ${j.data.address}`}
                onPointerDown={(e) => {
                  if (blocked || fixed || !e.isPrimary || e.button !== 0)
                    return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  pointer.current = {
                    id: j.id,
                    x: e.clientX,
                    y: e.clientY,
                    target: null,
                  };
                  setDrag({ id: j.id, target: null });
                }}
                onPointerMove={(e) => {
                  if (pointer.current) {
                    pointer.current.x = e.clientX;
                    pointer.current.y = e.clientY;
                  }
                }}
                onPointerUp={() => {
                  const p = pointer.current;
                  if (p?.target) move(p.id, p.target);
                  cancelDrag();
                }}
                onPointerCancel={cancelDrag}
                onLostPointerCapture={cancelDrag}
                onKeyDown={(e) => {
                  const target =
                    ordered[
                      i +
                        (e.key === "ArrowUp"
                          ? -1
                          : e.key === "ArrowDown"
                            ? 1
                            : 0)
                    ];
                  if (["ArrowUp", "ArrowDown"].includes(e.key)) {
                    e.preventDefault();
                    if (target) move(j.id, target.id);
                  }
                }}
              >
                {fixed ? <LockKeyhole size={18} /> : <GripVertical size={22} />}
              </button>
              <div className="pk-order-label">
                <strong>
                  {i + 1}. {j.data.senderName}
                </strong>
                <span>{j.data.address}</span>
                <small>
                  {j.data.windowFrom}–{j.data.windowTo}
                  {fixed ? ` · ${statusLabels[j.status]}` : ""}
                </small>
                {drag?.target === j.id && <small>Отпустите здесь</small>}
              </div>
              {!fixed && (
                <div className="pk-order-arrows">
                  {([-1, 1] as const).map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      disabled={
                        blocked ||
                        !ordered[i + delta] ||
                        !movePendingStop(ordered, j.id, ordered[i + delta]?.id)
                      }
                      aria-label={`${delta < 0 ? "Выше" : "Ниже"}: ${j.data.address}`}
                      onClick={() => move(j.id, ordered[i + delta].id)}
                    >
                      {delta < 0 ? (
                        <ArrowUp size={16} />
                      ) : (
                        <ArrowDown size={16} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
        <li className="pk-order-fixed">
          <LockKeyhole size={18} />
          <div className="pk-order-label">
            <strong>Финиш · склад HAULZ</strong>
            <span>{route.snapshot.depot?.data.address}</span>
          </div>
        </li>
      </ol>
      <footer>
        <p className="pk-hint" aria-live="polite">
          {message || "Изменения появятся у диспетчера после сохранения."}
        </p>
        {error && (
          <p className="pk-error" role="alert">
            {error}
          </p>
        )}
        <div className="pk-actions">
          <button
            className="pk-primary"
            disabled={blocked || !changed || !!drag}
            onClick={async () => {
              if (
                await onSave(
                  ordered.map((j) => j.id),
                  base.current.version,
                )
              )
                dialog.current?.close();
            }}
          >
            {busy ? "Сохраняем…" : "Сохранить порядок"}
          </button>
          <button disabled={busy} onClick={() => dialog.current?.close()}>
            Отмена
          </button>
        </div>
      </footer>
    </dialog>
  );
}

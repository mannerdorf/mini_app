import React, { useState } from "react";
import type { Job } from "../../../lib/pickup/model";
import { pickupJobCanCancel } from "../../../lib/pickup/model";
import { Textarea } from "./Forms";

type Props = {
  job: Job;
  busy: boolean;
  onConfirm: (note: string) => void | Promise<void>;
  compact?: boolean;
};

export function PickupCancelJobSection({
  job,
  busy,
  onConfirm,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  if (!pickupJobCanCancel(job.status)) {
    if (job.status === "cancelled" && job.resolution) {
      return (
        <p className="pk-muted pk-cancel-reason">
          Причина отмены: {job.resolution}
        </p>
      );
    }
    return null;
  }

  if (!open) {
    return (
      <button
        type="button"
        className={compact ? "pk-link-btn" : ""}
        onClick={() => setOpen(true)}
      >
        Отменить забор
      </button>
    );
  }

  return (
    <div className="pk-cancel-box">
      <Textarea
        label="Причина отмены"
        value={note}
        onChange={setNote}
      />
      <div className="pk-actions">
        <button
          type="button"
          className="pk-primary"
          disabled={busy || !note.trim()}
          onClick={() => void onConfirm(note.trim())}
        >
          Подтвердить отмену
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setNote("");
          }}
        >
          Назад
        </button>
      </div>
    </div>
  );
}

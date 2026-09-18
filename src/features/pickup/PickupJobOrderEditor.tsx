import React, { useState } from "react";
import { PickupDraftConflict, usePickupVersionedDraft } from "./PickupEditGuard";
import type { Job } from "../../../lib/pickup/model";

type Props = {
  job: Job;
  busy: boolean;
  act: (body: { action: string; id: string; version: number; zayavkaNumber: string }, title: string) => Promise<boolean>;
};

export function PickupJobOrderEditor({ job, busy, act }: Props) {
  const draft = usePickupVersionedDraft(job.version, job.data.zayavkaNumber || "");
  const { value: number, setValue: setNumber, saving, setSaving } = draft;
  const [message, setMessage] = useState("");
  const value = number.trim();
  return <section className="pk-panel" aria-label="Заявка по забору">
    {draft.conflict && <PickupDraftConflict acceptServer={draft.acceptServer} keepDraft={draft.keepDraft}>Номер на сервере: {job.data.zayavkaNumber || "не указан"}.</PickupDraftConflict>}
    <label className="pk-field">
      <span>Номер заявки</span>
      <input type="text" maxLength={100} value={number} disabled={busy || saving}
        placeholder="Как в 1С, включая начальные нули"
        onChange={e => { setNumber(e.target.value); setMessage(""); }} />
    </label>
    <p className="pk-hint">Можно указать или исправить номер, в том числе после сдачи груза на склад.</p>
    <button type="button" className="pk-primary" disabled={busy || saving || draft.conflict || !value || value === (job.data.zayavkaNumber || "").trim()}
      onClick={async () => {
        setSaving(true);
        try {
          const ok = await act({action:"set_job_order",id:job.id,version:draft.version,zayavkaNumber:value},"Номер заявки сохранён");
          if (ok) draft.saved();
          setMessage(ok ? "Номер заявки сохранён" : "Не удалось сохранить номер. Проверьте сообщение об ошибке и обновите карточку.");
        } catch { setMessage("Не удалось сохранить номер заявки. Попробуйте ещё раз."); }
        finally { setSaving(false); }
      }}>{saving ? "Сохраняем…" : "Сохранить номер заявки"}</button>
    {message && <p role="status">{message}</p>}
  </section>;
}

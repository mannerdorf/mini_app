import { pickupBillingExplanation } from "./pickupBillingExplanation";
import React, { useEffect, useState } from "react";
import { PickupDraftConflict, usePickupVersionedDraft } from "./PickupEditGuard";
import type { Job } from "../../../lib/pickup/model";
import type { PickupCall } from "./client";
import { PickupCustomerQuoteSection } from "./PickupCustomerQuoteSection";

type Props = {
  job: Job; busy: boolean; call: PickupCall; error?: string;
  act: (body: {action: string; id: string; version: number; data: Job["data"]}, title: string) => Promise<boolean>;
};
export function PickupJobBillingEditor({job,busy,call,act,error}: Props) {
  const draft = usePickupVersionedDraft(job.version, job.data);
  const { value: data, setValue: setData, saving, setSaving } = draft;
  const locked = Boolean(job.billing_status && job.billing_status !== "not_issued");
  const [message,setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!draft.dirty || draft.conflict || busy || saving || locked || failed) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      setMessage("Сохраняем…");
      try {
        const ok = await act({ action: "set_job_billing", id: job.id, version: draft.version, data }, "Расчёты сохранены");
        if (ok) { draft.saved(); setMessage("Сохранено"); }
        else { setFailed(true); setMessage("Не удалось сохранить изменения"); }
      } catch { setFailed(true); setMessage("Не удалось сохранить изменения"); }
      finally { setSaving(false); }
    }, 700);
    return () => clearTimeout(timer);
  }, [data, draft.dirty, draft.conflict, draft.version, busy, saving, locked, failed, act, job.id]);
  const patchData = (patch: Partial<Job["data"]>) => {
    setData(prev => ({ ...prev, ...patch }));
    setFailed(false); setMessage("");
  };
  return <><details className="pk-panel pk-card-section">
    <summary>Расчёты с заказчиком · {job.data.issueCustomerBill ? (job.data.customerBillMode === "auto" ? "Автоматически" : "Вручную") : "Без счёта"}</summary>
    {draft.conflict && <PickupDraftConflict acceptServer={draft.acceptServer} keepDraft={draft.keepDraft}>Сумма на сервере: {job.data.priceRub ?? "не указана"}. Оплата: {job.data.payment || "не указана"}.</PickupDraftConflict>}
    {locked && <p role="status">Расчёты недоступны для изменения: стоимость уже передавалась в 1С или требует сверки. Проверьте результат в разделе «Выставление счетов».</p>}
    <fieldset disabled={busy || saving || locked} style={{border:0,padding:0,minWidth:0}}>
      <PickupCustomerQuoteSection city={job.city} data={data} call={call}
        onPatch={patchData}
        num={value=>value.trim()===""?null:Number(value)} />
      <label className="pk-field"><span>Оплата</span><input value={data.payment || ""}
        maxLength={100} onChange={e=>patchData({payment:e.target.value})} /></label>

    </fieldset>
    {message && <p role={failed ? "alert" : "status"}>{failed ? error || message : message}</p>}
    {failed && !locked && <button type="button" disabled={busy || saving || draft.conflict} onClick={() => setFailed(false)}>Повторить сохранение</button>}
  </details><details className="pk-panel pk-card-section"><summary>Синхронизация с 1С{job.billing_info?.error || job.number_sync_info?.error ? " · Требует внимания" : ""}</summary><p className="pk-hint">{pickupBillingExplanation(job)}</p>
    <p>Перевозка в последнем расчёте: {job.billing_info?.transportNumber || 'Не подтверждена. Откройте журнал счетов для проверки связи.'}</p>
    <p>Сумма в журнале: {job.billing_info?.amount != null ? `${job.billing_info.amount} ₽` : 'Не рассчитана или не сохранена'}</p>
    {job.billing_info?.updatedAt && <p>Расчёт обновлён: {new Date(job.billing_info.updatedAt).toLocaleString('ru-RU')}</p>}
    {job.billing_info?.error && <p role="alert">{job.billing_info.error}</p>}
    <p>Номер заявки: {job.data.zayavkaNumber || 'Не заполнен'}. Передача номера: {job.number_sync_info?.state === 'synced' ? 'Подтверждена' : job.number_sync_info?.state === 'error' ? 'Ошибка — требуется проверка' : job.number_sync_info ? 'Ожидает синхронизации' : 'Нет сведений об очереди'}</p>
    {job.number_sync_info?.error && <p role="alert">{job.number_sync_info.error}</p>}
    <p className="pk-hint">Это сохранённые сведения, а не новый запрос в 1С. Исправьте номер или расчёты ниже; проверку связи с перевозкой выполните в журнале.</p>
  </details></>;
}

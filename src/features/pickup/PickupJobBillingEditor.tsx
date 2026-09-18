import { pickupBillingExplanation } from "./pickupBillingExplanation";
import React, { useState } from "react";
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
  return <><p className="pk-hint" role="status">{pickupBillingExplanation(job)}</p><details className="pk-panel"><summary>Диагностика счёта и номера заявки</summary>
    <p>Перевозка в последнем расчёте: {job.billing_info?.transportNumber || 'Не подтверждена. Откройте журнал счетов для проверки связи.'}</p>
    <p>Сумма в журнале: {job.billing_info?.amount != null ? `${job.billing_info.amount} ₽` : 'Не рассчитана или не сохранена'}</p>
    {job.billing_info?.updatedAt && <p>Расчёт обновлён: {new Date(job.billing_info.updatedAt).toLocaleString('ru-RU')}</p>}
    {job.billing_info?.error && <p role="alert">{job.billing_info.error}</p>}
    <p>Номер заявки: {job.data.zayavkaNumber || 'Не заполнен'}. Передача номера: {job.number_sync_info?.state === 'synced' ? 'Подтверждена' : job.number_sync_info?.state === 'error' ? 'Ошибка — требуется проверка' : job.number_sync_info ? 'Ожидает синхронизации' : 'Нет сведений об очереди'}</p>
    {job.number_sync_info?.error && <p role="alert">{job.number_sync_info.error}</p>}
    <p className="pk-hint">Это сохранённые сведения, а не новый запрос в 1С. Исправьте номер или расчёты ниже; проверку связи с перевозкой выполните в журнале.</p>
  </details><details className="pk-panel">
    <summary>Изменить расчёты с заказчиком</summary>
    {draft.conflict && <PickupDraftConflict acceptServer={draft.acceptServer} keepDraft={draft.keepDraft}>Сумма на сервере: {job.data.priceRub ?? "не указана"}. Оплата: {job.data.payment || "не указана"}.</PickupDraftConflict>}
    {locked && <p role="status">Расчёты недоступны для изменения: стоимость уже передавалась в 1С или требует сверки. Проверьте результат в разделе «Выставление счетов».</p>}
    <fieldset disabled={busy || saving || locked} style={{border:0,padding:0,minWidth:0}}>
      <PickupCustomerQuoteSection city={job.city} data={data} call={call}
        onPatch={patch=>{setData(prev=>({...prev,...patch}));setMessage("");}}
        num={value=>value.trim()===""?null:Number(value)} />
      <label className="pk-field"><span>Оплата</span><input value={data.payment || ""}
        maxLength={100} onChange={e=>setData(prev=>({...prev,payment:e.target.value}))} /></label>
      <p className="pk-hint">Окончательную сумму и передачу в 1С подтвердите в журнале счетов. Сохранение карточки не отправляет стоимость в 1С.</p>
      <button type="button" className="pk-primary" disabled={draft.conflict || locked} onClick={async()=>{
        setSaving(true);
        try {
          const ok=await act({action:"set_job_billing",id:job.id,version:draft.version,data},"Расчёты сохранены");
          if(ok) draft.saved();
          setMessage(ok?"Расчёты сохранены":"Не удалось сохранить. Проверьте сообщение об ошибке и обновите карточку.");
        } catch {setMessage("Не удалось сохранить расчёты. Попробуйте ещё раз.");}
        finally {setSaving(false);}
      }}>{saving?"Сохраняем…":"Сохранить расчёты"}</button>
    </fieldset>
    {message && <p role={error ? "alert" : "status"}>{error || message}</p>}
  </details></>;
}

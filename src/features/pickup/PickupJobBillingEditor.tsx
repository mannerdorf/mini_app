import React, { useState } from "react";
import type { Job } from "../../../lib/pickup/model";
import type { PickupCall } from "./client";
import { PickupCustomerQuoteSection } from "./PickupCustomerQuoteSection";

type Props = {
  job: Job; busy: boolean; call: PickupCall;
  act: (body: {action: string; id: string; version: number; data: Job["data"]}, title: string) => Promise<boolean>;
};
export function PickupJobBillingEditor({job,busy,call,act}: Props) {
  const [data,setData] = useState(job.data);
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState("");
  return <details className="pk-panel">
    <summary>Изменить расчёты с заказчиком</summary>
    <fieldset disabled={busy || saving} style={{border:0,padding:0,minWidth:0}}>
      <PickupCustomerQuoteSection city={job.city} data={data} call={call}
        onPatch={patch=>{setData(prev=>({...prev,...patch}));setMessage("");}}
        num={value=>value.trim()===""?null:Number(value)} />
      <label className="pk-field"><span>Оплата</span><input value={data.payment || ""}
        maxLength={100} onChange={e=>setData(prev=>({...prev,payment:e.target.value}))} /></label>
      <p className="pk-hint">Окончательную сумму и передачу в 1С подтвердите в журнале счетов. Сохранение карточки не отправляет стоимость в 1С.</p>
      <button type="button" className="pk-primary" onClick={async()=>{
        setSaving(true);
        try {
          const ok=await act({action:"set_job_billing",id:job.id,version:job.version,data},"Расчёты сохранены");
          setMessage(ok?"Расчёты сохранены":"Не удалось сохранить. Проверьте сообщение об ошибке и обновите карточку.");
        } catch {setMessage("Не удалось сохранить расчёты. Попробуйте ещё раз.");}
        finally {setSaving(false);}
      }}>{saving?"Сохраняем…":"Сохранить расчёты"}</button>
    </fieldset>
    {message && <p role="status">{message}</p>}
  </details>;
}

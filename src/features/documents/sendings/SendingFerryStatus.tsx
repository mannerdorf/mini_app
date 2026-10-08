import React, {useEffect,useState} from 'react';
import {fetchMarinesiaShip,type MarinesiaVessel} from '../../../api/client/ais';
import {NAV_STATUS_LABELS} from '../../../components/shared/VesselInfoPanel';

const REFRESH_MS = 2 * 60 * 60 * 1000;
const cache = new Map<string,{expires:number;result:Awaited<ReturnType<typeof fetchMarinesiaShip>>}>();
const pending = new Map<string,ReturnType<typeof fetchMarinesiaShip>>();
function load(mmsi:string) {
  const cached=cache.get(mmsi);if(cached && cached.expires>Date.now())return Promise.resolve(cached.result);
  const existing=pending.get(mmsi);if(existing)return existing;
  const task=fetchMarinesiaShip(mmsi,false,true).then(result=>{
    if(cache.size>=256)cache.delete(cache.keys().next().value!);
    cache.set(mmsi,{expires:Date.now()+(result.ok?REFRESH_MS:60000),result});return result;
  }).finally(()=>pending.delete(mmsi));
  pending.set(mmsi,task);return task;
}
export function ferryStatusBadge(vessel:MarinesiaVessel,now=Date.now()) {
  const ts=vessel.timeUtc;
  const time=ts ? Date.parse(/Z$|[+-]\d{2}:\d{2}$/.test(ts)?ts:`${ts}Z`) : NaN;
  const stale=!Number.isFinite(time)||now-time>6*3600000||time-now>5*60000;
  const status=vessel.status;
  const label=status===0||status===8 ? 'В движении' : status===1 ? 'На якоре' : status===5 ? 'На причале' : 'Статус AIS';
  const detail=status==null ? 'Не определён' : NAV_STATUS_LABELS[status] || 'Не определён';
  return {label:stale?`${label} · старые AIS`:label,tone:stale?'muted':status===0||status===8?'moving':status===5?'moored':status===1?'anchor':'muted',title:`Marinesia · ${detail}${stale?' (последний известный статус; свежего сообщения нет)':''}\nПоследнее сообщение: ${Number.isFinite(time)?new Date(time).toLocaleString('ru-RU'):'Дата неизвестна'}\nСкорость: ${vessel.sog ?? '—'} узлов`};
}
export function SendingFerryStatus({mmsi,onOpen}:{mmsi:string;onOpen:()=>void}) {
  const [state,setState]=useState<{mmsi:string;vessel?:MarinesiaVessel;error?:string}>({mmsi:''});
  useEffect(()=>{
    let active=true;
    let timer:ReturnType<typeof setTimeout>;
    const update=async()=>{
      try {
        const result=await load(mmsi);
        if(active)setState({mmsi,vessel:result.ok?result.vessel:undefined,error:result.error || (!result.vessel?'Нет данных AIS':undefined)});
      } catch {
        if(active)setState({mmsi,error:'Не удалось получить данные Marinesia'});
      }
      if(active)timer=setTimeout(()=>{void update();},Math.max(1000,(cache.get(mmsi)?.expires ?? Date.now()+REFRESH_MS)-Date.now()));
    };
    void update();
    return ()=>{active=false;clearTimeout(timer);};
  },[mmsi]);
  const visible=state.mmsi===mmsi?state:undefined;
  const badge=visible?.vessel?ferryStatusBadge(visible.vessel):{label:visible?.error?'AIS недоступен':'Загрузка AIS',tone:'muted',title:visible?.error || 'Получаем статус парома из Marinesia'};
  return <button type="button" className={`sendings-ferry-status sendings-ferry-status--${badge.tone}`} title={badge.title} aria-label={`${badge.label}. Открыть карту парома`} onClick={onOpen}>{badge.label}</button>;
}

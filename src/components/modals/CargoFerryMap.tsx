import React,{useEffect,useState} from 'react';
import type {AuthData,CargoItem} from '../../types';
import {apiFetchJson} from '../../utils';
import {perevozkiCustomerInn} from '../../../lib/perevozkiPartyMatch';
import {fetchMarinesiaShip,type MarinesiaVessel,type MarinesiaTrackPoint} from '../../api/client/ais';
import {SendingVesselMap} from '../../features/documents/sendings/SendingVesselMap';
import './cargo-ferry-map.css';

type State={key:string;unassigned?:boolean;vessel?:MarinesiaVessel;track?:MarinesiaTrackPoint[];error?:string};
export function CargoFerryMap({item,auth,fallback=null}:{item:CargoItem;auth:AuthData;fallback?:React.ReactNode}) {
 const number=String(item.rawNumber || item.Number || '');
 const customerInn=perevozkiCustomerInn(item);
 const {login,password}=auth;
 const key=JSON.stringify([number,customerInn,login,password]);
 const [state,setState]=useState<State>({key:''});
 useEffect(()=>{
  let active=true;
  setState({key});
  (async()=>{
   const {ferry}=await apiFetchJson<{ferry:{id:number;name:string;mmsi:string}|null}>('/api/cargo-ferry',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login,password,number,customerInn}),
   });
   if(!active)return;
   if(!ferry){setState({key,unassigned:true});return;}
   if(!/^\d{9}$/.test(ferry.mmsi))throw new Error('У выбранного парома не указан MMSI.');
   const result=await fetchMarinesiaShip(ferry.mmsi,true);
   if(!active)return;
   if(!result.ok || !result.vessel)throw new Error(result.error || 'Положение судна недоступно');
   setState({key,vessel:{...result.vessel,name:ferry.name},track:result.track || []});
  })().catch(error=>{if(active)setState({key,error:error instanceof Error?error.message:'Карта судна недоступна'});});
  return ()=>{active=false;};
 },[key,number,customerInn,login,password]);
 const visible=state.key===key?state:undefined;
 if(visible?.unassigned)return <>{fallback}</>;
 return <div className="cargo-ferry-map">
  <div className="cargo-ferry-map__canvas">
   {visible?.vessel?<SendingVesselMap vessel={visible.vessel} track={visible.track} embedded/>:<p role={visible?.error?'alert':'status'}>{visible?.error || 'Загрузка карты парома…'}</p>}
  </div>
  {visible?.vessel && <p className="cargo-ferry-map__caption">{visible.vessel.name} · Marinesia · {visible.track?.length?'Пройденный путь AIS':'Последняя позиция AIS'}{visible.vessel.timeUtc ? ` · ${visible.vessel.timeUtc.replace('T',' ').replace(/Z$/,'')} UTC` : ''}</p>}
 </div>;
}

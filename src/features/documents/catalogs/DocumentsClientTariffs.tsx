import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { AuthData } from '../../../types';
import { apiFetchJson } from '../../../utils';
import { formatCurrency } from '../../../lib/formatUtils';
import './DocumentsClientTariffs.css';

type Tariff = Record<string, unknown>;
type Result = {inn:string; tariffs:Tariff[]; fetchedAt:string};
const labels: Record<string,string> = {
  Дата:'Действует с', ГородОтправления:'Отправление', ГородНазначения:'Назначение',
  ВесОт:'Вес от', ВесДо:'Вес до', ВидПеревозки:'Вид перевозки', ОГ:'Опасный груз (ОГ)', ВС:'ВС', Акциз:'Акциз',
  Тариф:'Тариф', ТарифОГ:'Тариф ОГ', ВесМин:'Минимальный вес', КоэффициентОбъема:'Коэффициент объёма',
  КоэффициентВеса:'Коэффициент веса', КоэффициентОбВеса:'Коэффициент объёмного веса', ПоУмолчанию:'По умолчанию',
  МаксШирина:'Максимальная ширина', МаксДлина:'Максимальная длина', МаксВысота:'Максимальная высота',
  ВыделятьНаСкладе:'Выделять на складе', АвтоформированиеСчета:'Автоформирование счёта', SLA:'SLA', SLAОГ:'SLA ОГ',
};
function value(key:string, raw:unknown):string {
  if (raw == null || raw === '') return '—';
  if (typeof raw === 'boolean') return raw ? 'Да' : 'Нет';
  if (key === 'Дата') {
    const date = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return date ? `${date[3]}.${date[2]}.${date[1]}` : String(raw);
  }
  if ((key === 'Тариф' || key === 'ТарифОГ') && typeof raw === 'number') return formatCurrency(raw);
  if (typeof raw === 'number') return raw.toLocaleString('ru-RU');
  return typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
}
/** Mount only while the tariff tab and service mode are active. */
export function DocumentsClientTariffs({auth,inn,customerName}:{auth:AuthData;inn:string;customerName?:string}) {
  const {login,password,isRegisteredUser} = auth;
  const context = JSON.stringify([login,password,isRegisteredUser,inn]);
  const [reload,setReload] = useState(0);
  const [state,setState] = useState<{context:string;data?:Result;error?:string}>({context:''});
  useEffect(() => {
    let current = true;
    setState({context});
    if (!inn) return () => {current=false;};
    apiFetchJson<Result>('/api/client-tariffs', {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({login,password,isRegisteredUser,inn,serviceMode:true})})
      .then(data => {if(current)setState({context,data});})
      .catch(error => {if(current)setState({context,error:error instanceof Error ? error.message : 'Не удалось загрузить тарифы'});});
    return () => {current=false;};
  },[context,reload,login,password,isRegisteredUser,inn]);
  const visible = state.context === context ? state : undefined;
  const loading = !!inn && !visible?.data && !visible?.error;
  return <section className="client-tariffs" aria-label="Действующие тарифы клиента">
    <header className="client-tariffs-heading">
      <div><h3>Действующие тарифы клиента</h3><p>{customerName || inn || 'Выберите заказчика в шапке'}{customerName && inn ? ` · ${inn}` : ''}</p></div>
      <button type="button" className="client-tariffs-refresh" disabled={!inn || loading} onClick={()=>setReload(n=>n+1)} aria-label="Обновить тарифы клиента" title="Обновить"><RefreshCw size={18}/></button>
    </header>
    {loading && <p role="status">Загрузка тарифов клиента…</p>}
    {visible?.error && <p role="alert">{visible.error}</p>}
    {visible?.data && !visible.data.tariffs.length && <p>Для этого клиента действующие тарифы не заданы.</p>}
    {visible?.data?.tariffs.map((row,index)=><article className="client-tariff" key={index}>
      <div className="client-tariff-summary">
        <strong>{value('ГородОтправления',row.ГородОтправления)} → {value('ГородНазначения',row.ГородНазначения)}</strong>
        <span>{value('ВидПеревозки',row.ВидПеревозки)}</span>
        <span>Вес: {value('ВесОт',row.ВесОт)}–{value('ВесДо',row.ВесДо)}</span>
        <strong>{value('Тариф',row.Тариф)}</strong>
      </div>
      <div className="client-tariff-flags">{['ОГ','ВС','Акциз','ПоУмолчанию'].filter(key=>row[key]===true).map(key=><span key={key}>{labels[key]}</span>)}<span>С {value('Дата',row.Дата)}</span></div>
      <details><summary>Все условия</summary><dl className="client-tariff-fields">{Object.entries(row).map(([key,raw])=><div key={key}><dt>{labels[key] || key}</dt><dd>{value(key,raw)}</dd></div>)}</dl></details>
    </article>)}
  </section>;
}

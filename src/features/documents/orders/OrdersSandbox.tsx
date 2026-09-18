import React, { useState } from 'react';
import type { AuthData } from '../../../types';
import { apiFetchJson } from '../../../utils';
import { PROXY_API_ORDERS_URL } from '../../../constants/config';
import type { diagnoseOrders } from '../../../../lib/ordersDiagnostics';

type Report = Awaited<ReturnType<typeof diagnoseOrders>>;
type Props = {auth:AuthData; inn?:string; customerName?:string; serviceMode:boolean;
  dateFrom:string; dateTo:string; received:number; visible:number; listError:string|null; refresh:()=>Promise<unknown>};
const stages:Record<string,string>={start:'Запуск cron',configuration:'Настройка cron',request_1c:'Ожидание GetZayavki',response_1c:'Чтение и проверка ответа 1С',write_database:'Запись в БД',database_saved:'БД обновлена',complete:'Загрузка завершена'};
const time=(v:unknown)=>v?new Date(String(v)).toLocaleString('ru-RU'):'нет данных';
export function OrdersSandbox(props:Props) {
  const [report,setReport]=useState<Report|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copy,setCopy]=useState('');
  async function check() {
    setBusy(true);setError('');setReport(null);setCopy('');
    try {
      const result=await apiFetchJson<Report>(PROXY_API_ORDERS_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        login:props.auth.login,password:props.auth.password,isRegisteredUser:props.auth.isRegisteredUser,
        inn:props.inn,customerName:props.customerName,serviceMode:props.serviceMode,dateFrom:props.dateFrom,dateTo:props.dateTo,diagnostics:true,
      })});
      if(result?.version!=='orders-diagnostics-v1') throw new Error('Бэкенд ещё не поддерживает песочницу. Обновите API и перезапустите его.');
      setReport(result);
      await props.refresh();
    } catch(e) {setError(e instanceof Error?e.message:'Проверка недоступна');}
    finally {setBusy(false);}
  }
  const cron=report?.cron;
  const stalled=cron?.status==='running' && Date.now()-new Date(String(cron.updatedAt)).getTime()>120000;
  return <details style={{margin:'1rem 0',padding:'1rem',border:'1px solid var(--color-border)',borderRadius:12}}>
    <summary style={{cursor:'pointer',fontWeight:600}}>Песочница · путь загрузки заявок</summary>
    <p>GetZayavki → cron → cache_orders → API → фильтры приложения</p>
    <p>Проверка читает диагностику и обновляет журнал из БД. Загрузка из 1С выполняется отдельно по cron; создание заявок не запускается.</p>
    <p>Компания: {props.customerName || props.inn || 'Доступные компании'} · Период: {props.dateFrom} — {props.dateTo}</p>
    <button type="button" disabled={busy} onClick={()=>void check()}>{busy?'Проверяем…':'Проверить путь запросов'}</button>
    {error && <p role="alert">{error}</p>}
    {report && <div aria-live="polite">
      <ol>
        <li><strong>1С и cron.</strong> {cron?.available ? cron.stage ? stages[cron.stage] || cron.stage : 'Попытки ещё не записаны. Нужен запуск обновлённого cron.' : 'Диагностика недоступна: проверьте миграцию 115 и доступ к БД.'}
          <p>Начало: {time(cron?.startedAt)} · Последний этап: {time(cron?.updatedAt)}.</p>
          <p>Результат: {stalled?'Нет завершения более 2 минут — возможен таймаут или остановка процесса':cron?.status==='success'?'Успешно':cron?.status==='error'?'Ошибка':cron?.status==='running'?'Выполняется':'Неизвестен'}{cron?.httpStatus?` · HTTP ${cron.httpStatus}`:''}</p>
          {cron?.dateFrom && <p>Окно cron: {cron.dateFrom} — {cron.dateTo}. Выбор года в приложении не расширяет окно загрузки 1С.</p>}
          {cron?.error && <p role="alert">{cron.error}</p>}
        </li>
        <li><strong>База данных.</strong> {report.database.state==='ready'?`Снимок от ${time(report.database.fetchedAt)}${report.database.stale?' — устарел':''}`:report.database.state==='missing_snapshot'?'Снимок заявок ещё не создан':report.database.state==='invalid_payload'?'Некорректный формат кэша':'Не удалось прочитать cache_orders: проверьте подключение и миграции'}.</li>
        <li><strong>Фильтры API.</strong> {report.counts ? <>
          Доступно по ИНН и правам: {report.counts.authorized}; после названия компании: {report.counts.afterName}; после периода: {report.counts.afterDates}.
          {report.counts.authorized===0 && <p>В кэше нет заявок в выбранной области доступа. Проверьте загрузку, ИНН и привязку компании.</p>}
          {report.counts.authorized>report.counts.afterName && <p>Часть заявок исключена по названию компании. Проверьте соответствие названию в 1С.</p>}
          {report.counts.afterName>report.counts.afterDates && <p>Часть заявок находится за пределами выбранного периода.</p>}
        </>:'Не проверены: нет доступного снимка БД.'}</li>
        <li><strong>Приложение.</strong> Получено журналом: {props.received}; после поиска, отправителя, получателя и маршрута: {props.visible}.
          {props.listError && <p role="alert">{props.listError}</p>}
          <p>Количество в приложении может включать локальные заявки, ожидающие обновления из 1С.</p>
        </li>
      </ol>
      <p>Проверено: {time(report.checkedAt)} · ID API: {report.requestId} · ID cron: {cron?.requestId || 'нет'}</p>
      <button type="button" onClick={async()=>{try {await navigator.clipboard.writeText(JSON.stringify({...report,application:{received:props.received,visible:props.visible}},null,2));setCopy('Диагностика скопирована');}catch{setCopy('Не удалось скопировать. Можно прислать скриншот панели.');}}}>Скопировать диагностику</button>
      {copy && <p role="status">{copy}</p>}
    </div>}
  </details>;
}

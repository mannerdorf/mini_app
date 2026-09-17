import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft} from 'lucide-react';
import {Button,Flex,Panel,Typography} from '@maxhub/max-ui';
import type {Account} from '../../types';
import {fetchTwoFaSettings,twoFaRequest,type TwoFaSettings} from '../../api/client/twoFa';

type Props={activeAccount:Account;activeAccountId:string;onBack:()=>void;onUpdateAccount:(id:string,patch:Partial<Account>)=>void;onOpenTelegramBot?:()=>Promise<void>};
export function ProfileTwoFactorSection(props:Props) {
  return <TwoFactorEditor key={props.activeAccountId} {...props}/>;
}
function TwoFactorEditor({activeAccount,activeAccountId,onBack,onUpdateAccount,onOpenTelegramBot}:Props) {
  const [settings,setSettings]=useState<TwoFaSettings|null>(null);
  const [password,setPassword]=useState('');
  const [currentCode,setCurrentCode]=useState('');
  const [token,setToken]=useState('');
  const [expiresAt,setExpiresAt]=useState(0);
  const [setup,setSetup]=useState<{secret:string;qr:string}|null>(null);
  const [targetCode,setTargetCode]=useState('');
  const [telegramSent,setTelegramSent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const mounted=useRef(true);
  const login=activeAccount.login;
  const apply=(value:TwoFaSettings)=>{
    if (!mounted.current) return;
    setSettings(value);
    onUpdateAccount(activeAccountId,{twoFactorEnabled:value.enabled,twoFactorMethod:value.method,twoFactorTelegramLinked:value.telegramLinked,twoFactorGoogleSecretSet:value.googleSecretSet});
  };
  const clearSession=()=>{setToken('');setExpiresAt(0);setSetup(null);setTargetCode('');setTelegramSent(false);};
  useEffect(()=>{
    mounted.current=true;
    void fetchTwoFaSettings(login,activeAccount.password).then(data=>apply(data.settings)).catch(e=>{if(mounted.current)setError(e.message);});
    return ()=>{mounted.current=false;};
  },[login,activeAccount.password]);
  useEffect(()=>{
    if (!expiresAt) return;
    const timer=setTimeout(()=>{clearSession();setMessage('Сессия настройки истекла. Подтвердите доступ ещё раз.');},Math.max(0,expiresAt-Date.now()));
    return ()=>clearTimeout(timer);
  },[expiresAt]);
  async function run(operation:()=>Promise<void>) {
    if (busy) return;
    setBusy(true);setError('');setMessage('');
    try {await operation();} catch(e) {if(mounted.current)setError(e instanceof Error?e.message:'Не удалось сохранить настройку');}
    finally {if(mounted.current)setBusy(false);}
  }
  async function finish(path:'2fa'|'2fa-google'|'2fa-telegram',action:string) {
    const result=await twoFaRequest<{settings:TwoFaSettings}>(path,{login,settingsToken:token,action,code:targetCode});
    if (!mounted.current) return;
    apply(result.settings);clearSession();setMessage('Настройки подтверждены сервером.');
  }
  return <div className="w-full">
    <Flex align="center" style={{gap:12,marginBottom:16}}>
      <Button className="filter-button" onClick={onBack} aria-label="Назад"><ArrowLeft size={18}/></Button>
      <Typography.Headline className="text-page-title">Двухфакторная аутентификация</Typography.Headline>
    </Flex>
    <Panel className="cargo-card" style={{padding:16}}>
      <p>{settings ? settings.enabled ? `Включено: ${settings.method==='google'?'Google Authenticator':'Telegram'}` : 'Второй фактор выключен' : 'Настройки не загружены'}</p>
      {error && <p role="alert" style={{color:'var(--color-error-status)'}}>{error}</p>}
      {message && <p role="status">{message}</p>}
      {!token ? <form onSubmit={e=>{e.preventDefault();void run(async()=>{
        const result=await twoFaRequest<{token:string;expiresIn:number;settings:TwoFaSettings}>('2fa',{action:'authorize',login,password,code:currentCode});
        if (!mounted.current) return;
        apply(result.settings);setToken(result.token);setExpiresAt(Date.now()+result.expiresIn*1000);setPassword('');setCurrentCode('');
      });}} style={{display:'grid',gap:12,maxWidth:480}}>
        <p>Для изменения настроек подтвердите пароль{settings?.enabled?' и действующий второй фактор':''}. Доступ действует 5 минут, до первого сохранения.</p>
        <label>Пароль аккаунта<input className="admin-form-input" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy} style={{display:'block',width:'100%'}}/></label>
        {settings?.enabled && <>
          <label>Код {settings.method==='google'?'из Google Authenticator':'из Telegram'}<input className="admin-form-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={currentCode} onChange={e=>setCurrentCode(e.target.value.replace(/\D/g,''))} disabled={busy} style={{display:'block',width:'100%'}}/></label>
          {settings.method==='telegram' && <Button type="button" className="filter-button" disabled={busy||!password} onClick={()=>void run(async()=>{
            await twoFaRequest('2fa',{action:'send_session_code',login,password});if(mounted.current)setMessage('Код отправлен в привязанный Telegram.');
          })}>Получить код Telegram</Button>}
        </>}
        <Button type="submit" className="button-primary" disabled={busy||!password||(!!settings?.enabled&&currentCode.length!==6)}>{busy?'Проверка…':'Подтвердить доступ'}</Button>
        <Button type="button" className="filter-button" disabled={busy} onClick={()=>void run(async()=>apply((await fetchTwoFaSettings(login,password||activeAccount.password)).settings))}>Обновить состояние</Button>
      </form> : <fieldset disabled={busy} style={{border:0,padding:0,display:'grid',gap:12,maxWidth:480}}>
        <p>Доступ подтверждён. Текущий способ продолжит работать, пока вы не подтвердите новый.</p>
        <Button type="button" className="filter-button" disabled={busy} onClick={()=>void run(async()=>{
          const data=await twoFaRequest<{secret:string;otpauthUrl:string}>('2fa-google',{action:'setup',login,settingsToken:token});
          const {toDataURL}=await import('qrcode');
          const qr=await toDataURL(data.otpauthUrl,{width:220,margin:2});
          if(mounted.current){setSetup({secret:data.secret,qr});setTargetCode('');setTelegramSent(false);}
        })}>{settings?.googleSecretSet?'Заменить Google Authenticator':'Настроить Google Authenticator'}</Button>
        {setup && <>
          <img src={setup.qr} width={220} height={220} alt="QR-код для Google Authenticator"/>
          <p>Отсканируйте QR в приложении Authenticator. Ключ для ручного ввода: <code style={{overflowWrap:'anywhere'}}>{setup.secret}</code></p>
          <CodeInput value={targetCode} onChange={setTargetCode}/>
          <Button type="button" className="button-primary" disabled={busy||targetCode.length!==6} onClick={()=>void run(()=>finish('2fa-google','confirm_setup'))}>Проверить код и включить</Button>
          <Button type="button" className="filter-button" disabled={busy} onClick={()=>{setSetup(null);setTargetCode('');}}>Отменить настройку</Button>
        </>}
        {!setup && <>
          <Button type="button" className="filter-button" disabled={busy||!settings?.telegramLinked} onClick={()=>void run(async()=>{
            await twoFaRequest('2fa-telegram',{action:'send_target_code',login,settingsToken:token});if(mounted.current){setTelegramSent(true);setTargetCode('');setMessage('Код отправлен в привязанный Telegram.');}
          })}>Включить Telegram — получить код</Button>
          {!settings?.telegramLinked && <p>Сначала привяжите Telegram в боте, затем обновите состояние и подтвердите доступ заново.</p>}
          {!settings?.telegramLinked && onOpenTelegramBot && <Button type="button" className="filter-button" disabled={busy} onClick={()=>void run(onOpenTelegramBot)}>Открыть бота Telegram</Button>}
          {telegramSent && <><CodeInput value={targetCode} onChange={setTargetCode}/><Button type="button" className="button-primary" disabled={busy||targetCode.length!==6} onClick={()=>void run(()=>finish('2fa-telegram','enable'))}>Подтвердить Telegram</Button></>}
          {settings?.enabled && <Button type="button" className="filter-button" disabled={busy} onClick={()=>{
            if(window.confirm('Отключить второй фактор? Для входа останется только пароль.'))void run(()=>finish('2fa','disable'));
          }}>Отключить второй фактор</Button>}
        </>}
        <Button type="button" className="filter-button" disabled={busy} onClick={clearSession}>Закрыть доступ к настройкам</Button>
      </fieldset>}
    </Panel>
  </div>;
}
function CodeInput({value,onChange}:{value:string;onChange:(value:string)=>void}) {
  return <label>Код нового способа<input className="admin-form-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value} onChange={e=>onChange(e.target.value.replace(/\D/g,''))} style={{display:'block',width:'100%'}}/></label>;
}

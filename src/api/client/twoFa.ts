/** Server-confirmed 2FA settings. Settings grants live only in component memory. */
export type TwoFaSettings = {
  enabled:boolean;method:'google'|'telegram';telegramLinked:boolean;googleSecretSet:boolean;maxLinked?:boolean;
};
export type TwoFaSettingsPayload = {settings:TwoFaSettings};
export async function twoFaRequest<T>(path:'2fa'|'2fa-google'|'2fa-telegram',body:Record<string,unknown>):Promise<T> {
  const response=await fetch(`/api/${path}`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000),
  });
  const data=await response.json().catch(()=>null);
  if (!response.ok || !data?.ok) throw new Error(typeof data?.error==='string'?data.error:'Не удалось проверить 2FA. Повторите позже.');
  return data as T;
}
export async function fetchTwoFaSettings(login:string,password:string):Promise<TwoFaSettingsPayload> {
  const result=await twoFaRequest<TwoFaSettingsPayload>('2fa',{action:'read',login,password});
  const settings=result.settings;
  if (!settings || typeof settings.enabled !== 'boolean' || !['google','telegram'].includes(settings.method) || typeof settings.telegramLinked !== 'boolean' || typeof settings.googleSecretSet !== 'boolean') {
    throw new Error('Некорректный ответ настроек 2FA. Вход не подтверждён. Повторите позже.');
  }
  return result;
}
export function sendTelegramTwoFaCode(login:string,password:string):Promise<void> {
  return twoFaRequest('2fa-telegram',{login,password,action:'send'});
}
export function verifyTwoFactorCode(method:'telegram'|'google',login:string,code:string,password:string):Promise<void> {
  return twoFaRequest(method==='google'?'2fa-google':'2fa-telegram',{login,password,action:'verify',code:code.trim()});
}

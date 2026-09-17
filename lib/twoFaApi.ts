import type {VercelRequest,VercelResponse} from '@vercel/node';
import {getPool} from '../api/_db.js';
import {initRequestContext} from '../api/_lib/observability.js';
import {resolveCompanyAccess,CompanyAccessError} from './companyAccess.js';
import {createTwoFaSecurity,TwoFaError} from './twoFaSecurity.js';
import {getClientIp,isRateLimited,AUTH_2FA_SEND_LIMIT,AUTH_2FA_VERIFY_LIMIT,AUTH_LOGIN_LIMIT} from './rateLimit.js';

export const twoFaSecurity = createTwoFaSecurity();
export async function sendTwoFaTelegram(chatId:string,code:string) {
  const token=process.env.HAULZ_TELEGRAM_BOT_TOKEN || process.env.TG_BOT_TOKEN;
  if (!token) throw new TwoFaError(503,'Отправка кодов временно недоступна');
  const response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text:`Код подтверждения HAULZ: ${code}. Никому не сообщайте этот код.`}),signal:AbortSignal.timeout(10000),
  });
  const data:unknown=await response.json().catch(()=>null);
  if (!response.ok || !data || typeof data !== 'object' || !('ok' in data) || data.ok !== true) throw new TwoFaError(502,'Не удалось отправить код в Telegram');
}

/** Settings tokens are deliberately separate from application/admin/API-key credentials. */
export function twoFaHandler(kind:'settings'|'google'|'telegram') {
  return async(req:VercelRequest,res:VercelResponse) => {
    const ctx=initRequestContext(req,res,`2fa-${kind}`);
    res.setHeader('Cache-Control','no-store');
    const fail=(status:number,error:string)=>res.status(status).json({error,request_id:ctx.requestId});
    if (req.method !== 'POST') {
      res.setHeader('Allow','POST');
      return fail(req.method === 'GET'?401:405,'Для доступа к настройкам требуется авторизация');
    }
    let body:Record<string,unknown>;
    try {
      const parsed=typeof req.body === 'string'?JSON.parse(req.body):req.body;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail(400,'Некорректный запрос');
      body=parsed;
    } catch {return fail(400,'Некорректный JSON');}
    const login=typeof body.login === 'string'?body.login.trim():'';
    const password=typeof body.password === 'string'?body.password:'';
    const action=typeof body.action === 'string'?body.action:'';
    const code=typeof body.code === 'string'?body.code.trim():'';
    const token=typeof body.settingsToken === 'string'?body.settingsToken:'';
    if (!login) return fail(401,'Требуется авторизация');
    try {
      const sending=['send','send_session_code','send_target_code'].includes(action);
      const limit=sending?AUTH_2FA_SEND_LIMIT:action==='read'?AUTH_LOGIN_LIMIT:AUTH_2FA_VERIFY_LIMIT;
      // Shared across aliases so an attacker cannot gain attempts by switching endpoints.
      if (await isRateLimited(sending?'2fa_send_ip':'2fa_access_ip',getClientIp(req),limit) ||
          await isRateLimited(sending?'2fa_send_login':'2fa_access_login',login.toLowerCase(),limit)) return fail(429,'Слишком много попыток. Подождите минуту.');
      const result:Record<string,unknown>={ok:true,request_id:ctx.requestId};
      if (kind==='settings' && ['read','authorize','send_session_code'].includes(action)) {
        if (!password) return fail(401,'Подтвердите пароль аккаунта');
        await resolveCompanyAccess(getPool(),login,password);
        const state=await twoFaSecurity.read(login);
        if (action==='read') result.settings=state.settings;
        else if (action==='authorize') { Object.assign(result,await twoFaSecurity.issue(state,code)); result.settings=state.settings; }
        else {
          if (!state.settings.enabled || state.settings.method!=='telegram') return fail(400,'Для этого аккаунта код Telegram не требуется');
          await twoFaSecurity.sendCode(state,'settings-auth',sendTwoFaTelegram);
        }
      } else if (kind==='google' && action==='setup') Object.assign(result,await twoFaSecurity.setupGoogle(token,login));
      else if (kind==='google' && action==='confirm_setup') result.settings=await twoFaSecurity.change(token,'confirm_google',code,login);
      else if (kind==='telegram' && action==='send_target_code') await twoFaSecurity.sendTargetCode(token,sendTwoFaTelegram,login);
      else if (kind==='telegram' && action==='enable') result.settings=await twoFaSecurity.change(token,'enable_telegram',code,login);
      else if (action==='disable') result.settings=await twoFaSecurity.change(token,'disable','',login);
      else if (kind==='telegram' && action==='unlink') result.settings=await twoFaSecurity.change(token,'unlink','',login);
      else if (kind!=='settings' && ['verify','send'].includes(action)) {
        // Legacy login UI remains supported, but no anonymous reads, sends or OTP checks.
        if (!password) return fail(401,'Подтвердите пароль аккаунта');
        await resolveCompanyAccess(getPool(),login,password);
        const state=await twoFaSecurity.read(login);
        if (!state.settings.enabled || state.settings.method!==kind) return fail(400,'Этот способ подтверждения не включён');
        if (action==='send' && kind==='telegram') await twoFaSecurity.sendCode(state,'login',sendTwoFaTelegram);
        else if (action==='verify') await twoFaSecurity.consumeOtp(state,kind,code,'login');
        else return fail(400,'Неизвестное действие');
      } else return fail(400,'Обновите приложение: изменение 2FA требует подтверждённой сессии настройки');
      return res.status(200).json(result);
    } catch(error) {
      if (error instanceof TwoFaError || error instanceof CompanyAccessError) return fail(error.status,error.message);
      // Do not log secrets, OTPs, credentials, Redis responses or Telegram bot URLs.
      return fail(503,'Не удалось безопасно проверить или сохранить 2FA. Повторите позже.');
    }
  };
}

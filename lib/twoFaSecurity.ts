import {createHash,randomBytes,randomInt} from 'node:crypto';
import {generateSecret,generateURI,verify} from 'otplib';
import {twoFaStore,type TwoFaStore,type StoreChange} from './twoFaStore.js';

const TTL = 300;
const digest = (value:string) => createHash('sha256').update(value).digest('hex');
export class TwoFaError extends Error { constructor(public status:number,message:string){super(message);} }
export type TwoFaSettings = {enabled:boolean;method:'google'|'telegram';telegramLinked:boolean;googleSecretSet:boolean;maxLinked:boolean};
type State = {login:string;rawLogin:string;expected:Record<string,string|null>;settings:TwoFaSettings;secret:string|null;chatId:string|null};
type Grant = {scope:'two-fa-settings';login:string;rawLogin:string;revision:string};
const revision = (state:State) => digest(JSON.stringify(state.expected));
const sessionKey = (token:string) => `2fa:settings-session:${digest(token)}`;
const pendingKey = (token:string) => `2fa:pending-google:${digest(token)}`;
const codeKey = (login:string,purpose:string) => `2fa:secure-code:${digest(JSON.stringify([login,purpose]))}`;

/** A short session authorizes settings only. It is never an application login token. */
export function createTwoFaSecurity(store:TwoFaStore = twoFaStore, otpVerify = async(secret:string,code:string) => (await verify({secret,token:code})).valid) {
  async function read(rawLogin:string):Promise<State> {
    const login = rawLogin.trim().toLowerCase();
    if (!login) throw new TwoFaError(401,'Требуется авторизация');
    const owners = [...new Set([login,rawLogin.trim()])];
    const prefixes = ['2fa:login:','2fa:google_secret:','tg:by_login:'];
    const keys = prefixes.flatMap(prefix=>owners.map(owner=>prefix+owner));
    const values = await Promise.all(keys.map(key=>store.get(key)));
    const expected = Object.fromEntries(keys.map((key,i)=>[key,values[i]]));
    const lookup = (prefix:string) => owners.map(owner=>expected[prefix+owner]).find(value=>value !== null) ?? null;
    const raw = lookup('2fa:login:');
    let settings: {enabled?:boolean;method?:string} = {};
    if (raw !== null) {
      try { settings = JSON.parse(raw); } catch { throw new TwoFaError(503,'Настройки 2FA повреждены. Обратитесь в поддержку.'); }
      if (!settings || typeof settings !== 'object' || typeof settings.enabled !== 'boolean' || !['google','telegram'].includes(String(settings.method))) throw new TwoFaError(503,'Не удалось прочитать настройки 2FA');
    }
    const secret=lookup('2fa:google_secret:'),chatId=lookup('tg:by_login:');
    return {login,rawLogin:rawLogin.trim(),expected,secret,chatId,settings:{enabled:settings.enabled === true,method:settings.method === 'telegram'?'telegram':'google',googleSecretSet:!!secret,telegramLinked:!!chatId,maxLinked:!!await store.get(`max:by_login:${login}`)}};
  }
  async function consumeOtp(state:State,method:'google'|'telegram',code:string,purpose:string):Promise<void> {
    if (!/^\d{6}$/.test(code)) throw new TwoFaError(400,'Введите шестизначный код');
    if (method === 'google') {
      if (!state.secret) throw new TwoFaError(503,'Не найден действующий секрет 2FA. Обратитесь в поддержку.');
      if (!await otpVerify(state.secret,code)) throw new TwoFaError(400,'Неверный код');
      const used = `2fa:used-google:${digest(JSON.stringify([state.login,state.secret,code]))}`;
      if (!await store.compareAndSet({...state.expected,[used]:null},[{key:used,value:'1',ttl:90}])) throw new TwoFaError(409,'Код уже использован или настройки изменились. Дождитесь нового кода.');
    } else {
      const key=codeKey(state.login,purpose),raw=await store.get(key);
      let value:{hash?:string;revision?:string}|null=null;
      try {value=raw?JSON.parse(raw):null;} catch { /* reject malformed stored code */ }
      if (!value || value.hash !== digest(code) || value.revision !== revision(state)) throw new TwoFaError(400,'Неверный или устаревший код');
      if (!await store.compareAndSet({...state.expected,[key]:raw},[{key,value:null}])) throw new TwoFaError(409,'Код уже использован или настройки изменились');
    }
  }
  async function issue(state:State,code:string) {
    if (state.settings.enabled) await consumeOtp(state,state.settings.method,code,'settings-auth');
    const token=randomBytes(32).toString('base64url');
    const grant:Grant={scope:'two-fa-settings',login:state.login,rawLogin:state.rawLogin,revision:revision(state)};
    // No token can be minted for a stale state even if a simultaneous disable/replace won.
    if (!await store.compareAndSet(state.expected,[{key:sessionKey(token),value:JSON.stringify(grant),ttl:TTL}])) throw new TwoFaError(409,'Настройки изменились. Повторите подтверждение.');
    return {token,expiresIn:TTL};
  }
  async function authorize(token:string,requestedLogin?:string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new TwoFaError(401,'Подтвердите доступ к настройкам 2FA');
    const raw=await store.get(sessionKey(token));
    let grant:Grant|null=null;try {grant=raw?JSON.parse(raw):null;}catch{/* reject */}
    if (!grant || grant.scope !== 'two-fa-settings' || !grant.login || !grant.rawLogin) throw new TwoFaError(401,'Сессия настройки истекла. Подтвердите доступ ещё раз.');
    if (requestedLogin && requestedLogin.trim().toLowerCase() !== grant.login) throw new TwoFaError(403,'Нет доступа к настройкам другого аккаунта');
    const state=await read(grant.rawLogin);
    if (revision(state) !== grant.revision) throw new TwoFaError(409,'Настройки изменились. Подтвердите доступ ещё раз.');
    return {state,expected:{...state.expected,[sessionKey(token)]:raw}};
  }
  async function sendCode(state:State,purpose:string,send:(chatId:string,code:string)=>Promise<void>) {
    if (!state.chatId) throw new TwoFaError(400,state.settings.enabled && state.settings.method === 'telegram' ? 'Связь с Telegram для второго фактора утрачена. Обратитесь в поддержку.' : 'Telegram не привязан. Сначала привяжите бота.');
    const code=String(randomInt(100000,1000000));
    const key=codeKey(state.login,purpose),value=JSON.stringify({hash:digest(code),revision:revision(state)});
    if (!await store.compareAndSet(state.expected,[{key,value,ttl:TTL}])) throw new TwoFaError(409,'Настройки изменились');
    try {await send(state.chatId,code);} catch(error) {
      await store.compareAndSet({[key]:value},[{key,value:null}]);
      throw error;
    }
  }
  async function setupGoogle(token:string,login?:string) {
    const auth=await authorize(token,login),secret=generateSecret();
    if (!await store.compareAndSet(auth.expected,[{key:pendingKey(token),value:secret,ttl:TTL}])) throw new TwoFaError(409,'Сессия истекла или настройки изменились');
    return {secret,otpauthUrl:generateURI({issuer:'HAULZ',label:auth.state.login,secret})};
  }
  async function change(token:string,action:'confirm_google'|'enable_telegram'|'disable'|'unlink',code='',login?:string) {
    const auth=await authorize(token,login),{state}=auth;
    const changes:StoreChange[]=[{key:sessionKey(token),value:null},{key:pendingKey(token),value:null}];
    const expected={...auth.expected};
    let enabled=false,method=state.settings.method;
    if (action === 'confirm_google') {
      const secret=await store.get(pendingKey(token));
      if (!secret || !/^\d{6}$/.test(code) || !await otpVerify(secret,code)) throw new TwoFaError(400,'Неверный код или настройка истекла');
      expected[pendingKey(token)]=secret;
      const used=`2fa:used-google:${digest(JSON.stringify([state.login,secret,code]))}`;
      expected[used]=null;
      changes.push({key:used,value:'1',ttl:90},{key:`2fa:google_secret:${state.login}`,value:secret});
      enabled=true;method='google';
    } else if (action === 'enable_telegram') {
      await consumeOtp(state,'telegram',code,`target:${digest(token)}`);
      enabled=true;method='telegram';
    } else if (action === 'unlink') {
      enabled=state.settings.enabled && state.settings.method !== 'telegram';
      changes.push(...Object.keys(state.expected).filter(key=>key.startsWith('tg:by_login:')).map(key=>({key,value:null})));
    }
    // Canonical settings mask legacy mixed-case records; old clients may no longer write them.
    changes.push({key:`2fa:login:${state.login}`,value:JSON.stringify({enabled,method})});
    if (!await store.compareAndSet(expected,changes)) throw new TwoFaError(409,'Сессия истекла или настройки изменились. Повторите подтверждение.');
    return (await read(state.rawLogin)).settings;
  }
  async function linkTelegramFromVerifiedEmail(rawLogin:string,chatId:string,bindPayload:string,ttl:number) {
    const state=await read(rawLogin);
    if (state.settings.enabled && state.settings.method === 'telegram' && state.chatId !== chatId) {
      throw new TwoFaError(403,'Telegram используется для второго фактора. Сначала подтвердите изменение в профиле с действующим кодом. Если доступа нет, обратитесь в поддержку.');
    }
    if (!await store.compareAndSet(state.expected,[
      {key:`tg:by_login:${state.login}`,value:chatId},
      {key:`tg:bind:${chatId}`,value:bindPayload,ttl},
    ])) throw new TwoFaError(409,'Настройки изменились. Начните привязку заново.');
  }
  return {read,issue,authorize,setupGoogle,change,consumeOtp,sendCode,linkTelegramFromVerifiedEmail,
    sendTargetCode:async(token:string,send:(chat:string,code:string)=>Promise<void>,login?:string)=>{
      const {state}=await authorize(token,login);await sendCode(state,`target:${digest(token)}`,send);
    }};
}

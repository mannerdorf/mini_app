import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({access:vi.fn(),read:vi.fn(),issue:vi.fn(),setupGoogle:vi.fn(),change:vi.fn(),consumeOtp:vi.fn(),sendCode:vi.fn(),sendTargetCode:vi.fn(),limited:vi.fn()}));
vi.mock('./companyAccess.js',()=>({resolveCompanyAccess:mocks.access,CompanyAccessError:class extends Error{constructor(public status:number,message:string){super(message);}}}));
vi.mock('../api/_db.js',()=>({getPool:()=>({})}));
vi.mock('./rateLimit.js',()=>({getClientIp:()=> 'test-ip',isRateLimited:mocks.limited,AUTH_2FA_SEND_LIMIT:5,AUTH_2FA_VERIFY_LIMIT:10,AUTH_LOGIN_LIMIT:15}));
vi.mock('./twoFaSecurity.js',async importOriginal=>({...await importOriginal<typeof import('./twoFaSecurity')>(),createTwoFaSecurity:()=>mocks}));
import settings from '../api/2fa';
import google from '../api/2fa-google';
import telegram from '../api/2fa-telegram';
import unlink from '../api/telegram-unlink';
import {CompanyAccessError} from './companyAccess';
import {TwoFaError} from './twoFaSecurity';
const state={settings:{enabled:true,method:'google',googleSecretSet:true,telegramLinked:false},login:'alice'};
beforeEach(()=>{vi.clearAllMocks();mocks.limited.mockResolvedValue(false);mocks.access.mockResolvedValue({login:'alice'});mocks.read.mockResolvedValue(state);mocks.issue.mockResolvedValue({token:'settings-only',expiresIn:300});mocks.change.mockResolvedValue(state.settings);mocks.setupGoogle.mockResolvedValue({secret:'pending'});});
async function call(handler:typeof settings,body:Record<string,unknown>,method='POST'){
  const result={status:200,body:null as any,headers:{} as Record<string,unknown>};
  const res:any={setHeader:(key:string,value:unknown)=>{result.headers[key]=value;},status:(code:number)=>{result.status=code;return res;},json:(data:unknown)=>{result.body=data;return res;}};
  await handler({method,body,headers:{},query:{login:'alice'}} as any,res);return result;
}
it('rejects anonymous reads and legacy direct writes, setup, disable and unlink',async()=>{
  expect((await call(settings,{},'GET')).status).toBe(401);
  expect((await call(settings,{login:'alice',action:'read'})).status).toBe(401);
  expect((await call(settings,{login:'alice',enabled:false,method:'google'})).status).toBe(400);
  mocks.setupGoogle.mockRejectedValue(new TwoFaError(401,'token required'));
  mocks.change.mockRejectedValue(new TwoFaError(401,'token required'));
  expect((await call(google,{login:'alice',action:'setup'})).status).toBe(401);
  expect((await call(google,{login:'alice',action:'disable'})).status).toBe(401);
  expect((await call(telegram,{login:'alice',action:'unlink'})).status).toBe(401);
  expect((await call(unlink,{login:'alice'})).status).toBe(401);
  expect(mocks.access).not.toHaveBeenCalled();
});
it('does not read settings or issue grants after a rejected password',async()=>{
  mocks.access.mockRejectedValue(new CompanyAccessError(401,'invalid credentials'));
  for(const action of ['read','authorize','send_session_code'])expect((await call(settings,{login:'alice',password:'wrong',action})).status).toBe(401);
  expect(mocks.read).not.toHaveBeenCalled();expect(mocks.issue).not.toHaveBeenCalled();
});
it('authenticates reads and forwards code to grant issuer without leaking secret state',async()=>{
  const read=await call(settings,{login:'Alice',password:'password',action:'read'});
  expect(read.status).toBe(200);expect(read.body).toMatchObject({settings:state.settings});expect(read.body.secret).toBeUndefined();
  expect(read.headers['Cache-Control']).toBe('no-store');
  const result=await call(settings,{login:'Alice',password:'password',action:'authorize',code:'123456'});
  expect(result.body.token).toBe('settings-only');expect(mocks.issue).toHaveBeenCalledWith(state,'123456');
});
it('checks identity before login OTP verification and does not issue a settings grant',async()=>{
  expect((await call(google,{login:'alice',action:'verify',code:'123456'})).status).toBe(401);
  expect((await call(google,{login:'alice',password:'password',action:'verify',code:'123456'})).status).toBe(200);
  expect(mocks.consumeOtp).toHaveBeenCalledWith(state,'google','123456','login');expect(mocks.issue).not.toHaveBeenCalled();
});
it('fails closed on storage errors and stops at shared account/IP limits',async()=>{
  mocks.read.mockRejectedValue(new Error('internal secret details'));
  const failed=await call(settings,{login:'alice',password:'password',action:'read'});
  expect(failed.status).toBe(503);expect(JSON.stringify(failed.body)).not.toContain('internal secret');
  mocks.limited.mockResolvedValue(true);mocks.access.mockClear();
  expect((await call(settings,{login:'alice',password:'password',action:'authorize'})).status).toBe(429);
  expect(mocks.access).not.toHaveBeenCalled();
});
it('does not accept an obsolete setup verification action as activation',async()=>{
  await call(google,{login:'alice',settingsToken:'grant',action:'verify',code:'123456'});
  expect(mocks.change).not.toHaveBeenCalled();
  await call(google,{login:'alice',settingsToken:'grant',action:'confirm_setup',code:'123456'});
  expect(mocks.change).toHaveBeenCalledWith('grant','confirm_google','123456','alice');
});

import {beforeEach,describe,expect,it,vi} from 'vitest';
import {generateSecret,generate,verify} from 'otplib';
import {createTwoFaSecurity,TwoFaError} from './twoFaSecurity';
import type {TwoFaStore,StoreChange} from './twoFaStore';

/** Deterministic atomic store for protocol tests; Redis command adapter has separate tests. */
class MemoryStore implements TwoFaStore {
  now=0;
  rows=new Map<string,{value:string;expires:number}>();
  async get(key:string){const row=this.rows.get(key);return row&&row.expires>this.now?row.value:null;}
  async set(key:string,value:string,ttl:number){this.rows.set(key,{value,expires:this.now+ttl*1000});}
  async compareAndSet(expected:Record<string,string|null>,changes:StoreChange[]) {
    // No await between comparison and updates, like the production Lua transaction.
    for(const [key,value] of Object.entries(expected)){
      const row=this.rows.get(key),actual=row&&row.expires>this.now?row.value:null;
      if(actual!==value)return false;
    }
    for(const row of changes)row.value===null?this.rows.delete(row.key):this.rows.set(row.key,{value:row.value,expires:row.ttl?this.now+row.ttl*1000:Infinity});
    return true;
  }
}
let store:MemoryStore;
let service:ReturnType<typeof createTwoFaSecurity>;
beforeEach(()=>{store=new MemoryStore();service=createTwoFaSecurity(store,async(secret,code)=>code==='123456'&&!!secret);});
async function active(method:'google'|'telegram'='google'){
  await store.set('2fa:login:alice',JSON.stringify({enabled:true,method}),10000);
  await store.set('2fa:google_secret:alice','original-secret',10000);
  await store.set('tg:by_login:alice','chat-alice',10000);
}
async function grant(){return (await service.issue(await service.read('Alice'),'123456')).token;}

describe('settings scope',()=>{
  it('rejects missing, forged, expired and foreign-owner grants',async()=>{
    await expect(service.setupGoogle('')).rejects.toMatchObject({status:401});
    await expect(service.setupGoogle('a'.repeat(43))).rejects.toMatchObject({status:401});
    const token=await grant();
    await expect(service.setupGoogle(token,'bob')).rejects.toMatchObject({status:403});
    store.now=300001;
    await expect(service.setupGoogle(token,'alice')).rejects.toMatchObject({status:401});
  });
  it('requires the existing factor and prevents OTP reuse across settings and login',async()=>{
    await active();
    await expect(service.issue(await service.read('alice'),'999999')).rejects.toMatchObject({status:400});
    await grant();
    await expect(service.issue(await service.read('alice'),'123456')).rejects.toMatchObject({status:409});
    await expect(service.consumeOtp(await service.read('alice'),'google','123456','login')).rejects.toMatchObject({status:409});
  });
  it('keeps the working secret while setup is pending, invalid or expired',async()=>{
    await active();const token=await grant();
    const pending=await service.setupGoogle(token);
    expect(pending.secret).not.toBe('original-secret');
    expect(await store.get('2fa:google_secret:alice')).toBe('original-secret');
    await expect(service.change(token,'confirm_google','999999')).rejects.toMatchObject({status:400});
    expect(await store.get('2fa:google_secret:alice')).toBe('original-secret');
    store.now=300001;
    await expect(service.change(token,'confirm_google','123456')).rejects.toMatchObject({status:401});
    expect(await store.get('2fa:google_secret:alice')).toBe('original-secret');
  });
  it('confirms a new secret atomically and consumes the grant',async()=>{
    await active();const token=await grant(),pending=await service.setupGoogle(token);
    expect(await service.change(token,'confirm_google','123456')).toMatchObject({enabled:true,method:'google'});
    expect(await store.get('2fa:google_secret:alice')).toBe(pending.secret);
    await expect(service.change(token,'disable')).rejects.toMatchObject({status:401});
  });
  it('invalidates other grants on factor changes and never accepts state races',async()=>{
    const first=await grant(),second=await grant();
    await service.setupGoogle(first);
    await service.change(first,'confirm_google','123456');
    await expect(service.change(second,'disable')).rejects.toMatchObject({status:409});
    expect((await service.read('alice')).settings.enabled).toBe(true);
  });
  it('allows only one concurrent mutation with the same grant',async()=>{
    const token=await grant();await service.setupGoogle(token);
    const results=await Promise.allSettled([service.change(token,'confirm_google','123456'),service.change(token,'disable')]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  });
  it('does not trust telegramLinked from stored settings; malformed settings fail closed',async()=>{
    await store.set('2fa:login:alice',JSON.stringify({enabled:false,method:'google',telegramLinked:true}),10000);
    expect((await service.read('alice')).settings.telegramLinked).toBe(false);
    await store.set('2fa:login:alice','bad-json',10000);
    await expect(service.read('alice')).rejects.toMatchObject({status:503});
  });
  it('requires separate Telegram proofs for login, old factor and target setup',async()=>{
    await active('telegram');const state=await service.read('alice');
    const sent=vi.fn(async(_chat:string,_code:string)=>{});
    await service.sendCode(state,'login',sent);
    await expect(service.issue(state,sent.mock.calls[0][1])).rejects.toMatchObject({status:400});
    await service.sendCode(state,'settings-auth',sent);
    const {token}=await service.issue(state,sent.mock.calls[1][1]);
    await expect(service.change(token,'enable_telegram',sent.mock.calls[1][1])).rejects.toMatchObject({status:400});
    await service.sendTargetCode(token,sent);
    const targetCode=sent.mock.calls[2][1];
    expect((await service.change(token,'enable_telegram',targetCode)).enabled).toBe(true);
    await expect(service.change(token,'enable_telegram',targetCode)).rejects.toMatchObject({status:401});
  });
  it('binds Telegram codes and grants to the actual linked recipient',async()=>{
    await active('telegram');const sent=vi.fn(async(_chat:string,_code:string)=>{});
    const state=await service.read('alice');await service.sendCode(state,'settings-auth',sent);
    await store.set('tg:by_login:alice','another-chat',10000);
    await expect(service.issue(await service.read('alice'),sent.mock.calls[0][1])).rejects.toBeInstanceOf(TwoFaError);
  });
  it('removes an undelivered Telegram code and preserves active factor on unrelated unlink',async()=>{
    await active('google');const state=await service.read('alice');
    await expect(service.sendCode(state,'login',async()=>{throw new Error('offline');})).rejects.toThrow('offline');
    expect([...store.rows.keys()].filter(key=>key.startsWith('2fa:secure-code:'))).toEqual([]);
    const token=await grant();
    expect(await service.change(token,'unlink')).toMatchObject({enabled:true,method:'google',telegramLinked:false});
  });
  it('uses canonical disabled state ahead of historical mixed-case settings',async()=>{
    await store.set('2fa:login:Alice',JSON.stringify({enabled:true,method:'google'}),10000);
    await store.set('2fa:google_secret:Alice','old-secret',10000);
    const token=await grant();await service.change(token,'disable');
    expect((await service.read('Alice')).settings.enabled).toBe(false);
  });
  it('does not replace the active Telegram factor through email onboarding',async()=>{
    await active('telegram');
    await expect(service.linkTelegramFromVerifiedEmail('alice','attacker-chat','{}',300)).rejects.toMatchObject({status:403});
    expect(await store.get('tg:by_login:alice')).toBe('chat-alice');
    await expect(service.linkTelegramFromVerifiedEmail('alice','chat-alice','{}',300)).resolves.toBeUndefined();
  });
  it('permits initial Telegram linking but rejects concurrent factor changes',async()=>{
    await service.linkTelegramFromVerifiedEmail('alice','new-chat','{}',300);
    expect(await store.get('tg:by_login:alice')).toBe('new-chat');
    vi.spyOn(store,'compareAndSet').mockResolvedValueOnce(false);
    await expect(service.linkTelegramFromVerifiedEmail('alice','second-chat','{}',300)).rejects.toMatchObject({status:409});
    expect(await store.get('tg:by_login:alice')).toBe('new-chat');
  });
  it('validates real TOTP for staged setup',async()=>{
    service=createTwoFaSecurity(store);
    const token=await grant();const pending=await service.setupGoogle(token);
    const code=await generate({secret:pending.secret});
    expect((await service.change(token,'confirm_google',code)).enabled).toBe(true);
    expect((await verify({secret:pending.secret,token:code})).valid).toBe(true);
    await expect(service.consumeOtp(await service.read('alice'),'google',code,'login')).rejects.toMatchObject({status:409});
  });
});

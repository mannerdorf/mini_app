/** Security reads distinguish missing values from unavailable storage. */
export async function twoFaRedisCommand(command: Array<string | number>): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('2FA storage unavailable');
  const response = await fetch(`${url}/pipeline`, {
    method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify([command]), signal:AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('2FA storage unavailable');
  const data: unknown = await response.json();
  const first = Array.isArray(data) ? data[0] : undefined;
  if (!first || typeof first !== 'object' || 'error' in first || !('result' in first)) throw new Error('2FA storage unavailable');
  return first.result;
}
export type StoreChange = {key:string;value:string|null;ttl?:number};
export interface TwoFaStore {
  get(key:string):Promise<string|null>;
  set(key:string,value:string,ttl:number):Promise<void>;
  compareAndSet(expected:Record<string,string|null>,changes:StoreChange[]):Promise<boolean>;
}
// Read checks and all state changes form one Redis transaction, including OTP consumption.
export const TWO_FA_CAS = `
local expected = cjson.decode(ARGV[1])
local changes = cjson.decode(ARGV[2])
for key, value in pairs(expected) do
  local actual = redis.call('GET', key)
  if value == cjson.null then
    if actual then return 0 end
  elseif actual ~= value then return 0 end
end
for _, change in ipairs(changes) do
  if change.value == cjson.null then redis.call('DEL', change.key)
  elseif change.ttl then redis.call('SET', change.key, change.value, 'EX', change.ttl)
  else redis.call('SET', change.key, change.value) end
end
return 1
`;
export const twoFaStore: TwoFaStore = {
  async get(key) {
    const value = await twoFaRedisCommand(['GET',key]);
    if (value === null) return null;
    if (typeof value !== 'string') throw new Error('Invalid 2FA storage value');
    return value;
  },
  async set(key,value,ttl) {
    if (await twoFaRedisCommand(['SET',key,value,'EX',ttl]) !== 'OK') throw new Error('2FA write failed');
  },
  async compareAndSet(expected,changes) {
    const result = await twoFaRedisCommand(['EVAL',TWO_FA_CAS,0,JSON.stringify(expected),JSON.stringify(changes)]);
    if (result !== 0 && result !== 1) throw new Error('2FA transaction failed');
    return result === 1;
  },
};

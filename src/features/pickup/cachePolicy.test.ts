import { it, expect } from 'vitest';
import { storedValue, unpackValue, cacheBelongsTo, cacheHasUnsent, SNAPSHOT_MAX_AGE_MS } from './cachePolicy';
it('expires old snapshots without silently deleting unfinished photos or drafts',()=>{
  const now=1000000000,old=storedValue({photos:['photo'],actual:'2'},now-SNAPSHOT_MAX_AGE_MS-1);
  expect(unpackValue('snapshot:driver:moscow:day',old,now)).toEqual({value:undefined,expired:true});
  expect(unpackValue('driver-draft:["driver","job"]',old,now).value).toEqual(old.value);
  expect(unpackValue('outbox:driver',storedValue([old.value],0),now).expired).toBe(false);
  expect(unpackValue('snapshot:driver:day',{jobs:[]},now).expired).toBe(true);
});
it('matches exact owners and detects pending work before logout',()=>{
  expect(cacheBelongsTo('snapshot:alice:moscow:day','Alice')).toBe(true);
  expect(cacheBelongsTo('snapshot:alice2:moscow:day','alice')).toBe(false);
  expect(cacheBelongsTo('driver-draft:["alice","j"]','alice')).toBe(true);
  expect(cacheBelongsTo('driver-draft:["bob","j"]','alice')).toBe(false);
  expect(cacheHasUnsent('outbox:alice',[{}])).toBe(true);
  expect(cacheHasUnsent('driver-draft:["alice","j"]',{photos:['photo']})).toBe(true);
  expect(cacheHasUnsent('snapshot:alice:day',{jobs:[{}]})).toBe(false);
});

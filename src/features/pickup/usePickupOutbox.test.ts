import React from 'react';
import { create, act } from 'react-test-renderer';
import { it, expect, vi } from 'vitest';
vi.mock('./client',()=>({cacheRead:vi.fn(),cacheWrite:vi.fn()}));
import { cacheRead, cacheWrite } from './client';
import { usePickupOutbox } from './usePickupOutbox';
it('never exposes another account queue or replaces it with a late save',async()=>{
  vi.mocked(cacheRead).mockImplementation(async key=>key==='a'?[{id:'a',title:'A',body:{}}] as never:[] as never);
  let resolveSave!:()=>void;
  vi.mocked(cacheWrite).mockImplementation(()=>new Promise<void>(resolve=>{resolveSave=resolve;}));
  let current!:ReturnType<typeof usePickupOutbox>;
  function Harness({owner}:{owner:string}) {current=usePickupOutbox(owner,vi.fn());return null;}
  let root!:ReturnType<typeof create>;
  await act(async()=>{root=create(React.createElement(Harness,{owner:'a'}));});
  expect(current.items[0].id).toBe('a');
  const saving=current.save([{id:'a2',title:'A2',body:{}}]);
  act(()=>root.update(React.createElement(Harness,{owner:'b'})));
  expect(current.items).toEqual([]);
  await act(async()=>{resolveSave();await saving;});
  expect(current.items).toEqual([]);
  expect(cacheWrite).toHaveBeenCalledWith('a',[expect.objectContaining({id:'a2'})]);
  act(()=>root.unmount());
});

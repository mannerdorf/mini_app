import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { PickupEditGuardProvider, usePickupEditGuard, usePickupVersionedDraft } from './PickupEditGuard';
let root: ReturnType<typeof create>;
let guard: ReturnType<typeof usePickupEditGuard>;
let draft: ReturnType<typeof usePickupVersionedDraft<string>>;
function Editor({version,value}:{version:number;value:string}) {
  draft=usePickupVersionedDraft(version,value);return null;
}
function Test({version,value}:{version:number;value:string}) {
  guard=usePickupEditGuard();return React.createElement(PickupEditGuardProvider,{value:guard.states},React.createElement(Editor,{version,value}));
}
afterEach(async()=>{if(root)await act(async()=>root.unmount());vi.unstubAllGlobals();});
async function setup() {
 const confirm=vi.fn(()=>false);vi.stubGlobal('window',{confirm,addEventListener:vi.fn(),removeEventListener:vi.fn()});
 await act(async()=>{root=create(React.createElement(Test,{version:1,value:'000001'}));});return confirm;
}
it('guards dirty close, blocks closing a saving editor, allows pristine close',async()=>{
 await setup();expect(guard.canClose()).toBe(true);
 await act(async()=>draft.setValue('009999'));
 await act(async()=>{expect(guard.canClose()).toBe(false);});expect(guard.confirmClose).toBe(true);
 await act(async()=>guard.cancelClose());expect(guard.confirmClose).toBe(false);expect(draft.value).toBe('009999');
 await act(async()=>{expect(guard.canClose(true)).toBe(true);});
 await act(async()=>draft.setSaving(true));expect(guard.canClose()).toBe(false);
});
it('polling retains user input and requires an explicit rebase',async()=>{
 await setup();await act(async()=>draft.setValue('009999'));
 await act(async()=>root.update(React.createElement(Test,{version:2,value:'000002'})));
 expect(draft.value).toBe('009999');expect(draft.version).toBe(1);expect(draft.conflict).toBe(true);
 await act(async()=>draft.keepDraft());expect(draft.version).toBe(2);expect(draft.value).toBe('009999');expect(draft.conflict).toBe(false);
 await act(async()=>draft.acceptServer());expect(draft.value).toBe('000002');expect(guard.canClose()).toBe(true);
});
it('pristine editors adopt the new server version',async()=>{
 await setup();await act(async()=>root.update(React.createElement(Test,{version:3,value:'000003'})));
 expect(draft.value).toBe('000003');expect(draft.version).toBe(3);
});

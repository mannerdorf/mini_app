import React from 'react';
import {act,create} from 'react-test-renderer';
import {expect,it,vi} from 'vitest';
import {AdminUserRow} from './AdminUserRow';
import {TapSwitch} from '../../../components/TapSwitch';
it('separates permissions from activity, blocks repeated writes and recovers after failure',async()=>{
 let reject!:(e:Error)=>void;const toggle=vi.fn(()=>new Promise<void>((_,r)=>{reject=r;})),edit=vi.fn();let root:any;
 await act(async()=>{root=create(React.createElement(AdminUserRow,{user:{login:'fixture',active:true} as any,adminToken:'fixture',onToggleActive:toggle,onEditPermissions:edit}));});
 const handler=root.root.findByType(TapSwitch).props.onToggle;let pending:Promise<void>;
 act(()=>{pending=handler();void handler();});
 expect(toggle).toHaveBeenCalledTimes(1);expect(root.root.findByType(TapSwitch).props.disabled).toBe(true);expect(edit).not.toHaveBeenCalled();
 await act(async()=>{reject(new Error('server'));await pending;});
 expect(root.root.findByType(TapSwitch).props.disabled).toBe(false);expect(root.root.findByProps({role:'alert'}).children.join('')).toContain('Не удалось');
 act(()=>root.root.findByProps({'aria-label':'Права пользователя fixture'}).props.onClick());expect(edit).toHaveBeenCalledTimes(1);
 expect(root.root.findAll(n=>n.type==='div'&&n.props.role==='button')).toHaveLength(0);act(()=>root.unmount());
});

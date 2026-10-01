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
 act(()=>root.root.findByProps({'aria-label':'Права пользователя fixture'}).props.onClick({stopPropagation:vi.fn()}));expect(edit).toHaveBeenCalledTimes(1);
 expect(root.root.findAll(n=>n.type==='div'&&n.props.role==='button')).toHaveLength(0);act(()=>root.unmount());
});

it('opens permissions from the card and handles the login click once with an expanded state',async()=>{
 const user={id:6,login:'fixture',active:true} as any;const edit=vi.fn(),toggle=vi.fn();let root:any;
 await act(async()=>{root=create(React.createElement(AdminUserRow,{user,onToggleActive:toggle,onEditPermissions:edit,expanded:true}));});
 const card=root.root.findAllByType('div').find((n:any)=>n.props.style?.cursor==='pointer');
 act(()=>card.props.onClick());expect(edit).toHaveBeenCalledWith(user);
 const button=root.root.findByProps({'aria-label':'Права пользователя fixture'});
 expect(button.props['aria-expanded']).toBe(true);
 const stopPropagation=vi.fn();act(()=>button.props.onClick({stopPropagation}));
 expect(stopPropagation).toHaveBeenCalledOnce();expect(edit).toHaveBeenCalledTimes(2);
 expect(toggle).not.toHaveBeenCalled();act(()=>root.unmount());
});

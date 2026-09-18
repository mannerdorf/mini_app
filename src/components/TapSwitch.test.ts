import React from 'react';import{act,create}from'react-test-renderer';import{expect,it,vi}from'vitest';import{TapSwitch}from'./TapSwitch';
it.each(['default','comfortable'] as const)('names and disables the %s switch',variant=>{
 const toggle=vi.fn();let root:any;act(()=>{root=create(React.createElement(TapSwitch,{variant,checked:true,onToggle:toggle,'aria-label':'Таблица',disabled:true}));});
 const b=root.root.findByType('button');expect(b.props.role).toBe('switch');expect(b.props['aria-checked']).toBe(true);expect(b.props['aria-label']).toBe('Таблица');expect(b.props.disabled).toBe(true);
 act(()=>{b.props.onClick();});expect(toggle).not.toHaveBeenCalled();act(()=>root.unmount());
});

it.each(['default','comfortable'] as const)('uses one native activation for %s', variant => {
 const toggle=vi.fn(); let root:any;
 act(()=>{root=create(React.createElement(TapSwitch,{variant,checked:false,onToggle:toggle,'aria-label':'Уведомления'}));});
 const button=root.root.findByType('button');
 expect(button.props.onKeyDown).toBeUndefined();
 act(()=>button.props.onClick());
 expect(toggle).toHaveBeenCalledTimes(1);
 act(()=>root.unmount());
});

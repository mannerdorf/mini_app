import React from 'react';
import {act,create} from 'react-test-renderer';
import {it,expect,vi} from 'vitest';
import {PickupJobOrderEditor} from './PickupJobOrderEditor';
it('lets dispatcher set an order on a deposited job without changing its status',async()=>{
  const save=vi.fn().mockResolvedValue(true);
  let root:ReturnType<typeof create>;
  await act(async()=>{root=create(React.createElement(PickupJobOrderEditor,{job:{id:'j1',version:3,status:'deposited',data:{}} as any,busy:false,act:save}));});
  try {
    expect(root!.root.findByType('button').props.disabled).toBe(true);
    await act(async()=>root!.root.findByType('input').props.onChange({target:{value:' 000018123 '}}));
    expect(root!.root.findByType('button').props.disabled).toBe(false);
    await act(async()=>root!.root.findByType('button').props.onClick());
    expect(save).toHaveBeenCalledWith({action:'set_job_order',id:'j1',version:3,zayavkaNumber:'000018123'},expect.any(String));
    expect(JSON.stringify(root!.toJSON())).toContain('Номер заявки сохранён');
  } finally {await act(async()=>root!.unmount());}
});
it('opens the linked order without saving and keeps editing available separately',async()=>{
  const open=vi.fn(),save=vi.fn();
  let root:ReturnType<typeof create>;
  await act(async()=>{root=create(React.createElement(PickupJobOrderEditor,{job:{id:'j1',version:3,data:{zayavkaNumber:'000018356'}} as any,busy:false,act:save,inline:true,onOpen:open}));});
  try {
    await act(async()=>root!.root.findByProps({className:'pk-document-number'}).props.onClick());
    expect(open).toHaveBeenCalledWith('000018356');
    expect(save).not.toHaveBeenCalled();
    await act(async()=>root!.root.findByProps({'aria-label':'Изменить номер заявки'}).props.onClick());
    expect(root!.root.findByType('input').props.value).toBe('000018356');
  } finally {await act(async()=>root!.unmount());}
});

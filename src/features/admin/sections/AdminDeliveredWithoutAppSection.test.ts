import React from 'react';
import {act,create} from 'react-test-renderer';
import {expect,it,vi} from 'vitest';
vi.mock('@maxhub/max-ui',()=>({Flex:({children}:any)=>React.createElement('div',{},children),Panel:({children}:any)=>React.createElement('div',{},children),Typography:{Body:({children}:any)=>React.createElement('p',{},children),Label:({children}:any)=>React.createElement('span',{},children),Headline:({children}:any)=>React.createElement('h3',{},children)}}));
vi.mock('../../../api/client/haulzAnalytics',()=>({fetchHaulzInvoices:async()=>[],fetchHaulzPerevozki:async()=>[
 {Number:'10',State:'Доставлено',Customer:'Бета'},
 {Number:'2',State:'Доставлено',Customer:'Альфа',DDRecipientResponseStatus_APP:'RecipientResponseStatusSigned'},
]}));
import {AdminDeliveredWithoutAppSection} from './AdminDeliveredWithoutAppSection';
it('filters by summary buttons and toggles column sorting',async()=>{
 let root:ReturnType<typeof create>;
 await act(async()=>{root=create(React.createElement(AdminDeliveredWithoutAppSection,{auth:{login:'test',password:'fixture'}}));});
 const rows=()=>root!.root.findAllByType('tbody')[0].findAllByType('tr').map(r=>r.findAllByType('td')[0].children.join(''));
 const metric=(label:string)=>root!.root.findAllByType('button').find(b=>b.findAllByType('span').some(s=>s.children.join('')===label))!;
 try {
  expect(rows()).toEqual(['10']);
  act(()=>metric('С АПП').props.onClick());expect(rows()).toEqual(['2']);
  act(()=>metric('Доставлено').props.onClick());expect(rows()).toHaveLength(2);
  const header=()=>root!.root.findAllByType('th')[0];
  act(()=>header().findByType('button').props.onClick());expect(rows()).toEqual(['2','10']);expect(header().props['aria-sort']).toBe('ascending');
  act(()=>header().findByType('button').props.onClick());expect(rows()).toEqual(['10','2']);expect(header().props['aria-sort']).toBe('descending');
  act(()=>metric('Без АПП').props.onClick());expect(rows()).toEqual(['10']);
  act(()=>metric('Без АПП').props.onClick());expect(rows()).toHaveLength(2);
 } finally {act(()=>root!.unmount());}
});

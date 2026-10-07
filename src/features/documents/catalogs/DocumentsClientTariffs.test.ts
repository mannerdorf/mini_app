import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../../../utils',()=>({apiFetchJson:vi.fn()}));
import {apiFetchJson} from '../../../utils';
import {DocumentsClientTariffs} from './DocumentsClientTariffs';
let root:ReturnType<typeof create>;
const props={auth:{login:'staff',password:'fixture',isRegisteredUser:true},inn:'7701234567',customerName:'Клиент A'};
afterEach(()=>{act(()=>root?.unmount());vi.clearAllMocks();});
it('does not load tariffs without a selected company',async()=>{
  await act(async()=>{root=create(React.createElement(DocumentsClientTariffs,{...props,inn:'',customerName:''}));});
  expect(apiFetchJson).not.toHaveBeenCalled();expect(JSON.stringify(root.toJSON())).toContain('Выберите заказчика');
});
it('ignores a late tariff response from the previous company',async()=>{
  let resolve!:(value:any)=>void;
  vi.mocked(apiFetchJson).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
  vi.mocked(apiFetchJson).mockResolvedValueOnce({inn:'7801234567',tariffs:[],fetchedAt:'now'} as any);
  await act(async()=>{root=create(React.createElement(DocumentsClientTariffs,props));});
  await act(async()=>{root.update(React.createElement(DocumentsClientTariffs,{...props,inn:'7801234567',customerName:'Клиент B'}));});
  await act(async()=>{resolve({inn:props.inn,tariffs:[{ГородОтправления:'PRIVATE_OLD_CITY'}]});});
  expect(JSON.stringify(root.toJSON())).not.toContain('PRIVATE_OLD_CITY');
  expect(JSON.stringify(root.toJSON())).toContain('не заданы');
});
it('preserves zero values, false flags and new upstream fields in details',async()=>{
  vi.mocked(apiFetchJson).mockResolvedValue({inn:props.inn,tariffs:[{ГородОтправления:'Москва',ГородНазначения:'Казань',ВесОт:0,ВесДо:1,Тариф:0,ОГ:false,ExtraField:'New data'}],fetchedAt:'now'} as any);
  await act(async()=>{root=create(React.createElement(DocumentsClientTariffs,props));});
  const content=JSON.stringify(root.toJSON());
  expect(content).toContain('ExtraField');expect(content).toContain('New data');expect(content).toContain('Нет');
  expect(root.root.findByType('details').props.open).toBeUndefined();
  expect(JSON.parse(vi.mocked(apiFetchJson).mock.calls[0][1]?.body as string)).toMatchObject({serviceMode:true,inn:props.inn});
});

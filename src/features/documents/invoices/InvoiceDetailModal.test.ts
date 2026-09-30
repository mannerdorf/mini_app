import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('react-dom',()=>({createPortal:(children:any)=>children}));
vi.mock('@maxhub/max-ui',()=>({Flex:'div',Typography:{Body:'p',Headline:'h2',Label:'span'}}));
vi.mock('../../../utils',()=>({apiFetchJson:vi.fn()}));
vi.mock('../../../components/modals/EntityDetailModalHeader',()=>({EntityDetailModalHeader:()=>null}));
vi.mock('./InvoicePaymentQrBlock',()=>({InvoicePaymentQrBlock:()=>null}));
vi.mock('../../../components/ui/DateText',()=>({DateText:()=>null}));
vi.mock('../components/DocumentDetailLineCards',()=>({DocumentDetailLineCards:({rows}:any)=>React.createElement('div',null,rows.map((r:any)=>r.Name).join(','))}));
import {apiFetchJson} from '../../../utils';
import {InvoiceDetailModal} from './InvoiceDetailModal';
let root:ReturnType<typeof create>;
const stub={Number:'0000-004157',Customer:'Клиент',_invoiceReferenceDate:'2026-09-29'};
const full={...stub,DateDoc:'2026-09-29',Status:'Оплачен',List:[{Name:'Услуги по забору груза',Sum:1350}]};
const props={item:stub,isOpen:true,onClose:()=>{},auth:{login:'test',password:'test',isRegisteredUser:true},useServiceRequest:true};
afterEach(()=>{if(root)act(()=>root.unmount());vi.clearAllMocks();vi.unstubAllGlobals();});
async function mount(item=stub){vi.stubGlobal('document',{body:{}});await act(async()=>{root=create(React.createElement(InvoiceDetailModal,{...props,item}));});}
it('loads the full invoice for a number-only link using the existing authorized API',async()=>{
 vi.mocked(apiFetchJson).mockResolvedValue([full]);await mount();
 const request=JSON.parse(vi.mocked(apiFetchJson).mock.calls[0][1]!.body as string);
 expect(request).toMatchObject({invoiceNumber:stub.Number,dateFrom:'2026-01-01',dateTo:'2026-12-31',serviceMode:true,isRegisteredUser:true,cacheOnly:true});
 expect(JSON.stringify(root.toJSON())).toContain('Услуги по забору груза');
 expect(JSON.stringify(root.toJSON())).not.toContain('Нет номенклатуры');
});
it('shows loading instead of an empty invoice while request is pending',async()=>{
 vi.mocked(apiFetchJson).mockReturnValue(new Promise(()=>{}));await mount();
 expect(JSON.stringify(root.toJSON())).toContain('Загружаем счёт');
 expect(JSON.stringify(root.toJSON())).not.toContain('Нет номенклатуры');
});
it('shows a retry after an API error and loads successfully on retry',async()=>{
 vi.mocked(apiFetchJson).mockRejectedValueOnce(new Error('Сеть недоступна')).mockResolvedValueOnce([full]);await mount();
 expect(JSON.stringify(root.toJSON())).toContain('Сеть недоступна');
 await act(async()=>root.root.findAllByType('button').find(b=>b.children.includes('Повторить загрузку'))!.props.onClick());
 expect(JSON.stringify(root.toJSON())).toContain('Услуги по забору груза');
});
it('does not fetch an already complete invoice',async()=>{await mount(full);expect(apiFetchJson).not.toHaveBeenCalled();});

import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it } from 'vitest';
import { UnpaidInvoicesPlanMonitor } from './UnpaidInvoicesPlanMonitor';
it.each([{loading:true},{cargoLoading:true},{error:'503'}])('never claims debts are absent before a complete successful read: %j',async(state)=>{
 let root:ReturnType<typeof create>;
 await act(async()=>{root=create(React.createElement(UnpaidInvoicesPlanMonitor,{invoices:[],cargoItems:[],...state}));});
 try {const text=JSON.stringify(root!.toJSON());expect(text).not.toContain('задолженностей не найдено');expect(text).not.toContain('все счета оплачены');}
 finally{await act(async()=>root!.unmount());}
});
it('limits the empty result to the queried period',async()=>{
 let root:ReturnType<typeof create>;
 await act(async()=>{root=create(React.createElement(UnpaidInvoicesPlanMonitor,{invoices:[],cargoItems:[]}));});
 try {expect(JSON.stringify(root!.toJSON())).toContain('За последние 3 месяца задолженностей не найдено');}
 finally{await act(async()=>root!.unmount());}
});

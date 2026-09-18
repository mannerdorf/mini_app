import React from 'react';
import { act, create } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
vi.mock('./Forms',()=>({Textarea:()=>null}));
import { PickupCustomerQuoteSection } from './PickupCustomerQuoteSection';
import { TapSwitch } from '../../components/TapSwitch';
it.each([{enabled:false,price:100,expected:false},{enabled:true,price:null,expected:true},{enabled:undefined,price:100,expected:false},{enabled:undefined,price:null,expected:false}])('respects explicit billing choice %j',async({enabled,price,expected})=>{
 let root:ReturnType<typeof create>;
 await act(async()=>{root=create(React.createElement(PickupCustomerQuoteSection,{city:'moscow',data:{issueCustomerBill:enabled,priceRub:price} as any,call:vi.fn(),onPatch:vi.fn(),num:Number}));});
 try {expect(root!.root.findByType(TapSwitch).props.checked).toBe(expected);}
 finally {await act(async()=>root!.unmount());}
});

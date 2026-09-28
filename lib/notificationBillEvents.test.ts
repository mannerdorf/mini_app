import { it, expect } from "vitest";
import { hasBillSignal } from "./notificationPoll.js";
import { billEventsOnChange } from "../api/_lib/webpushEventDispatch.js";
it.each(["Не выставлен"," НЕ  ВЫСТАВЛЕН ","невыставлен","not issued",""])("does not invent an invoice from %s", state => {
  const item={Number:"000142712",StateBill:state};
  expect(hasBillSignal(item)).toBe(false);
  expect(billEventsOnChange(false,null,item,true)).toEqual([]);
});
it("detects a later invoice and subsequent payment after not-issued status",()=>{
  expect(billEventsOnChange(false,"Не выставлен",{StateBill:"Не оплачен",BillNum:"000123"},false)).toEqual(["bill_created"]);
  expect(billEventsOnChange(false,"Не оплачен",{StateBill:"Оплачен",BillNum:"000123"},false)).toEqual(["bill_paid"]);
});
it("keeps a real invoice number authoritative and defers genuinely issued missing numbers",()=>{
  expect(hasBillSignal({StateBill:"Не выставлен",BillNum:"000123"})).toBe(true);
  expect(billEventsOnChange(false,null,{StateBill:"Не оплачен"},true)).toEqual(["bill_created"]);
});

import {expect,it} from 'vitest';import {pickupBillingExplanation}from './pickupBillingExplanation';import{pickupEventLabel}from'./pickupEventLabel';
it('explains eligibility without claiming that transport matching or transmission succeeded',()=>{
 const job:any={status:'deposited',date:'2026-09-19',data:{issueCustomerBill:false,zayavkaNumber:'001'}};
 expect(pickupBillingExplanation(job)).toContain('выключено');job.data.issueCustomerBill=true;job.status='picked_up';expect(pickupBillingExplanation(job)).toContain('после сдачи');job.status='deposited';expect(pickupBillingExplanation(job)).toContain('2026-09-19');expect(pickupBillingExplanation(job)).toContain('не подтверждает синхронизацию');
});
it('translates legacy actions, preserves Russian events and safely labels unknown actions',()=>{expect(pickupEventLabel('set_job_billing')).toBe('Изменены расчёты с заказчиком');expect(pickupEventLabel('Груз забран')).toBe('Груз забран');expect(pickupEventLabel('new_internal_action')).toBe('Другое действие');});

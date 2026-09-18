import { expect, it, vi } from 'vitest';
vi.mock('./_base',()=>({fetchJson:vi.fn(),loginPasswordHeaders:()=>({}),apiErrorMessage:(_:unknown,fallback:string)=>fallback}));
import { fetchJson } from './_base';
import { fetchMyExpenseRequests } from './expenseRequestsUser';
it('distinguishes failed loading from a successful empty list',async()=>{
 vi.mocked(fetchJson).mockResolvedValueOnce({ok:false,status:503,data:{error:'unavailable'}} as any);
 await expect(fetchMyExpenseRequests({login:'test',password:'test-only'})).rejects.toThrow('Не удалось загрузить заявки на расходы');
 vi.mocked(fetchJson).mockResolvedValueOnce({ok:true,status:200,data:{items:[]}} as any);
 await expect(fetchMyExpenseRequests({login:'test',password:'test-only'})).resolves.toEqual({items:[]});
});

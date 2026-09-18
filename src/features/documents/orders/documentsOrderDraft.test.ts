import { afterEach, expect, it, vi } from 'vitest';
import { clearDocumentsOrderDraft, documentsOrderDraftKey, hasDocumentsOrderDrafts, readDocumentsOrderDraft, retainDocumentsOrderDraftAccounts, saveDocumentsOrderDraft } from './documentsOrderDraft';
afterEach(()=>{retainDocumentsOrderDraftAccounts([]);vi.unstubAllGlobals();});
it('isolates companies/accounts, retains file references and deletes after success',()=>{
 const a=documentsOrderDraftKey('user','001'),b=documentsOrderDraftKey('user','002'),c=documentsOrderDraftKey('other','001');
 const file={name:'invoice.xlsx'},draft={nomerZayavki:'000001',cargo:{fileUpd:file}} as any;
 saveDocumentsOrderDraft(a,'user',draft);
 expect(readDocumentsOrderDraft(a)?.cargo.fileUpd).toBe(file);expect(readDocumentsOrderDraft(b)).toBeUndefined();expect(readDocumentsOrderDraft(c)).toBeUndefined();
 clearDocumentsOrderDraft(a);expect(hasDocumentsOrderDrafts()).toBe(false);
});
it('protects reload while a draft exists and purges removed accounts',()=>{
 const add=vi.fn(),remove=vi.fn();vi.stubGlobal('window',{addEventListener:add,removeEventListener:remove});
 const key=documentsOrderDraftKey('USER','001');saveDocumentsOrderDraft(key,'USER',{nomerZayavki:'001'} as any);
 const event={preventDefault:vi.fn(),returnValue:undefined};add.mock.calls[0][1](event);
 expect(event.preventDefault).toHaveBeenCalled();
 retainDocumentsOrderDraftAccounts(['user']);expect(readDocumentsOrderDraft(key)).toBeDefined();
 retainDocumentsOrderDraftAccounts([]);expect(hasDocumentsOrderDrafts()).toBe(false);expect(remove).toHaveBeenCalledOnce();
});

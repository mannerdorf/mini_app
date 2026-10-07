import {expect,it} from 'vitest';
import {sendingCargoDetailNumbers,mergeSendingCargoDetails} from './sendingCargoDetails';
import {buildByCargoSummaries} from './sendingsByCustomerSummaryHelpers';
import {buildCargoStateByNumber,buildCargoSumByNumber,normCargoKey} from '../lib/documentsPipeline';
it('collects consolidations without parcel IDs, deduplicating leading zeros',()=>{
 expect(sendingCargoDetailNumbers({Посылки:[{Перевозка:'000141598',ИДОтправления:'999'},{Перевозка:'141598'},{Перевозка:'141857'},{ИДОтправления:'888'}]})).toEqual(['141598','141857']);
});
it('hydrates an older cargo and populates status, customer and freight in the sending summary',()=>{
 const items=mergeSendingCargoDetails([{Number:'142264',State:'В пути'}],[{Number:'000141598',State:'В пути',Customer:'АВТОПИТЕР ООО',Sum:'30891',DatePrih:'2026-08-11'}]);
 const customers=new Map(items.map(c=>[normCargoKey(c.Number),c.Customer]));
 const summaries=buildByCargoSummaries([{Перевозка:'141598',ВесДляОтчета:267,ПлатныйВес:294}],{},buildCargoStateByNumber(items),customers,buildCargoSumByNumber(items));
 expect(summaries[0]).toMatchObject({status:'В пути',customer:'АВТОПИТЕР ООО',cost:30891});
});
it('refreshes fields without duplicating normalized cargo and preserves annotations',()=>{
 expect(mergeSendingCargoDetails([{Number:'141598',State:'Старый',pickupHasDriverPhotos:true}],[{Number:'000141598',State:'В пути'}])).toEqual([{Number:'000141598',State:'В пути',pickupHasDriverPhotos:true}]);
});

import { expect, it } from 'vitest';
import { deliveryForCargo } from './cargoLastMile';
it('matches delivery by both customer and transport, never picks an ambiguous delivery', () => {
  const cargo={Number:'000123',ЗаказчикИНН:'100'};
  const job={job_number:'DL-1',data:{customerInn:'100',cargoNumber:'123'}};
  expect(deliveryForCargo(cargo,[job])).toBe(job);
  expect(deliveryForCargo({...cargo,ЗаказчикИНН:'200'},[job])).toBeUndefined();
  expect(deliveryForCargo(cargo,[job,{...job,job_number:'DL-2'}])).toBeUndefined();
});

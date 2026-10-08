import {expect,it} from 'vitest';
import {aisClearlyInland} from './aisLandCheck';
it('flags the MIA inland fix while allowing its harbour and sea positions',()=>{
 expect(aisClearlyInland(59.879532,30.325514)).toBe(true);
 expect(aisClearlyInland(59.875908,30.193373)).toBe(false);
 expect(aisClearlyInland(59.901325,30.100937)).toBe(false);
});
it('does not classify locations outside the supported extract',()=>{
 expect(aisClearlyInland(50,30)).toBe(false);
});

import {afterEach,expect,it,vi} from 'vitest';
import {syncAppUrlWithActiveTab} from './appWb';
afterEach(()=>vi.unstubAllGlobals());
it('does not attach private tabs to public landing or calculator URLs',()=>{
 for(const path of ['/kalkulyator?direction=mow_kgd','/faq','/perevozka-moskva-kaliningrad']){
  const replaceState=vi.fn();vi.stubGlobal('window',{location:{href:'https://haulz.space'+path},history:{replaceState}});
  syncAppUrlWithActiveTab('cargo');expect(replaceState).not.toHaveBeenCalled();
 }
});
it('preserves normal account navigation',()=>{
 const replaceState=vi.fn();vi.stubGlobal('window',{location:{href:'https://haulz.space/'},history:{replaceState}});
 syncAppUrlWithActiveTab('cargo');expect(replaceState).toHaveBeenCalledWith(null,'','https://haulz.space/?tab=cargo');
});

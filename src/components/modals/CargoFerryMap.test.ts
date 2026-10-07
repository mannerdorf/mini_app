import React from 'react';
import {act,create} from 'react-test-renderer';
import {expect,it,vi} from 'vitest';
vi.mock('../../utils',()=>({apiFetchJson:vi.fn()}));
vi.mock('../../api/client/ais',()=>({fetchMarinesiaShip:vi.fn()}));
vi.mock('../../features/documents/sendings/SendingVesselMap',()=>({SendingVesselMap:({embedded}:any)=>React.createElement('iframe',{'data-embedded':embedded})}));
import {apiFetchJson} from '../../utils';
import {fetchMarinesiaShip} from '../../api/client/ais';
import {CargoFerryMap} from './CargoFerryMap';
const props={item:{Number:'142978',INN:'7710431565'} as any,auth:{login:'staff',password:'fixture'},fallback:React.createElement('div',{'data-animation':true},'Original route animation')};
it('loads the linked ferry and renders its compact AIS map',async()=>{
 vi.mocked(apiFetchJson).mockResolvedValue({ferry:{id:1,name:'FESCO NOVIK',mmsi:'273329660'}});
 vi.mocked(fetchMarinesiaShip).mockResolvedValue({ok:true,vessel:{mmsi:'273329660',name:'',lat:55,lon:19},track:[]});
 let root:ReturnType<typeof create>;
 await act(async()=>{root=create(React.createElement(CargoFerryMap,props));});
 try {expect(root!.root.findByType('iframe').props['data-embedded']).toBe(true);expect(fetchMarinesiaShip).toHaveBeenCalledWith('273329660',true);expect(JSON.stringify(root!.toJSON())).toContain('FESCO NOVIK');}
 finally {act(()=>root!.unmount());vi.clearAllMocks();}
});
it('shows the original animation for an unassigned ferry without calling Marinesia',async()=>{
 vi.mocked(apiFetchJson).mockResolvedValue({ferry:null});
 let root:ReturnType<typeof create>;
 await act(async()=>{root=create(React.createElement(CargoFerryMap,props));});
 try {expect(root!.root.findByProps({'data-animation':true})).toBeDefined();expect(JSON.stringify(root!.toJSON())).not.toContain('Паром не выбран');expect(fetchMarinesiaShip).not.toHaveBeenCalled();}
 finally {act(()=>root!.unmount());vi.clearAllMocks();}
});

it('does not conceal lookup failures as an unassigned ferry',async()=>{
 vi.mocked(apiFetchJson).mockRejectedValue(new Error('Ошибка соединения'));
 let root:ReturnType<typeof create>;
 await act(async()=>{root=create(React.createElement(CargoFerryMap,props));});
 try {expect(JSON.stringify(root!.toJSON())).toContain('Ошибка соединения');expect(root!.root.findAllByProps({'data-animation':true})).toHaveLength(0);}
 finally {act(()=>root!.unmount());vi.clearAllMocks();}
});

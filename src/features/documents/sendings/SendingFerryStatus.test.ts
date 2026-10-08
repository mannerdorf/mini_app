import React from 'react';
import {act,create} from 'react-test-renderer';
import {expect,it,vi} from 'vitest';
vi.mock('../../../api/client/ais',()=>({fetchMarinesiaShip:vi.fn()}));
import {fetchMarinesiaShip} from '../../../api/client/ais';
import {SendingFerryStatus,ferryStatusBadge} from './SendingFerryStatus';
const now=Date.parse('2026-10-07T15:00:00Z');
const vessel={mmsi:'273611990',name:'MIA',lat:59,lon:30,timeUtc:'2026-10-07T14:30:00',sog:0};
it('uses AIS navigation status without inferring unloading from zero speed',()=>{
 expect(ferryStatusBadge({...vessel,status:0},now).label).toBe('В движении');
 expect(ferryStatusBadge({...vessel,status:5},now).label).toBe('На причале');
 expect(ferryStatusBadge({...vessel,status:1},now).label).toBe('На якоре');
 expect(ferryStatusBadge(vessel,now).label).toBe('Статус AIS');
});
it('does not present an old or invalid timestamp as a current status',()=>{
 for(const timeUtc of ['2026-10-06T14:30:00','bad',undefined,'2026-10-08T14:30:00'])
 expect(ferryStatusBadge({...vessel,status:5,timeUtc},now).label).toBe('На причале · старые AIS');
});
it('shows less common AIS statuses in the tooltip',()=>{
 expect(ferryStatusBadge({...vessel,status:2},now).title).toContain('Не под управлением');
 expect(ferryStatusBadge({...vessel,status:5},now).title).toContain('Marinesia');
});

it('does not reload on remount or before two hours, then refreshes',async()=>{
 vi.useFakeTimers();vi.setSystemTime(now);
 vi.mocked(fetchMarinesiaShip).mockResolvedValue({ok:true,vessel});
 let root:ReturnType<typeof create> | undefined;
 const props={mmsi:'273329660',onOpen:()=>{}};
 try {
  await act(async()=>{root=create(React.createElement(SendingFerryStatus,props));});
  expect(fetchMarinesiaShip).toHaveBeenCalledTimes(1);
  await act(async()=>{await vi.advanceTimersByTimeAsync(3600000);});
  act(()=>root!.unmount());
  await act(async()=>{root=create(React.createElement(SendingFerryStatus,props));});
  expect(fetchMarinesiaShip).toHaveBeenCalledTimes(1);
  await act(async()=>{await vi.advanceTimersByTimeAsync(3600000);});
  expect(fetchMarinesiaShip).toHaveBeenCalledTimes(2);
  expect(fetchMarinesiaShip).toHaveBeenLastCalledWith(props.mmsi,false,true);
 } finally {act(()=>root?.unmount());vi.useRealTimers();vi.clearAllMocks();}
});

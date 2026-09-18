import React from 'react';import{act,create}from'react-test-renderer';import{afterEach,expect,it,vi}from'vitest';
vi.mock('./PickupStopOrder',()=>({PickupStopOrder:()=>null}));vi.mock('./PickupDriverLocation',()=>({PickupDriverLocation:()=>null}));vi.mock('./PickupDriverJobFlow',()=>({PickupDriverJobFlow:()=>null}));
import{PickupDriverMobileRoute}from'./PickupDriverMobileRoute';import{PickupDriverJobFlow}from'./PickupDriverJobFlow';
let root:any;afterEach(()=>act(()=>root?.unmount()));
const props:any={driverLogin:'test',route:{id:'r',status:'started',version:1,acknowledged_version:1,snapshot:{},date:'2026-09-19'},routeJobs:['a','b'].map(id=>({id,status:'pending',data:{senderName:id,address:id}})),city:'moscow',busy:false,error:'',stale:true,outboxCount:1,outboxReady:true,routePending:true,pendingJobIds:['a'],routeCommandPending:false,driverCanOperate:true,call:vi.fn(),locationAvailable:false,onSync:vi.fn(),onStartRoute:vi.fn(),onAckRoute:vi.fn(),act:vi.fn()};
it('allows an independent stop while preserving the queued stop',()=>{act(()=>{root=create(React.createElement(PickupDriverMobileRoute,props));});expect(root.root.findByType(PickupDriverJobFlow).props.job.id).toBe('b');expect(root.root.findByType(PickupDriverJobFlow).props.busy).toBe(false);expect(JSON.stringify(root.toJSON())).toContain('ещё не подтверждены');});
it('blocks dependent route commands until synchronization',()=>{act(()=>{root=create(React.createElement(PickupDriverMobileRoute,{...props,routeCommandPending:true}));});expect(root.root.findAllByType(PickupDriverJobFlow)).toHaveLength(0);expect(JSON.stringify(root.toJSON())).toContain('Отправьте сохранённые отметки');});
it('allows completing the current stop after a safely queued arrival',()=>{
 const commands=[{id:'req',title:'Прибыл',body:{id:'a',action:'arrive',version:1}}];
 act(()=>{root=create(React.createElement(PickupDriverMobileRoute,{...props,routeJobs:props.routeJobs.map((j:any)=>({...j,version:1})),pendingCommands:commands}));});
 const flow=root.root.findByType(PickupDriverJobFlow);
 expect(flow.props.job.id).toBe('a');
 expect(flow.props.job.status).toBe('arrived');
 expect(flow.props.job.version).toBe(1);
 expect(flow.props.busy).toBe(false);
});

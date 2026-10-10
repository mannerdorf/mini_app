import type {PlanningMode,VehicleDimensions} from './planningModel';
export type CargoAmount={weight:number;volume:number};
export type FlowDay=CargoAmount & {date:string;count:number;missing:number};
export type ForecastSchedule={id:string;date:string;route:string;mode:PlanningMode;vehicleId:string;vehicleDimensions?:VehicleDimensions|null};
export type RouteFlows={route:string;stock:CargoAmount;stockCount:number;stockMissing:number;incoming:FlowDay[];outgoing:FlowDay[]};
export type AccumulationData={today:string;historyFrom:string;historyTo:string;checkedAt:string;routes:RouteFlows[];schedule:ForecastSchedule[];undatedDepartures:number;unmatchedDepartures?:number};
export const shiftDay=(date:string,days:number)=>new Date(Date.parse(`${date}T12:00:00Z`)+days*86400000).toISOString().slice(0,10);

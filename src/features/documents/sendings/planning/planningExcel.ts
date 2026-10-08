import type {TmsCargo} from '../../../tms/model';
import {MODE_LABELS,vehicleName,planningVehicle,type PlanDraft} from './planningModel';
import {PICKER_VIEWS,groupPickerHierarchy,type PlanningPickerView} from './planningPickerModel';
export type PlanningExport={draft:PlanDraft;cargo:TmsCargo[];actual:Set<string>;ferryName:string;view:PlanningPickerView};
const date=(value:string|undefined)=>value?new Date(`${value}T00:00:00Z`):null;
export function planningExportRows({cargo,actual,view}:PlanningExport) {
 const rows:unknown[][]=[['Группа','Подгруппа','Перевозка','Поступление на склад','Заказчик','Получатель','Отправитель','Мест','Вес, кг','Объём, м³','Платный вес, кг','Плановая дата доставки','Факт отправки','Срок по SLA','SLA, дней']];
 const append=(item:TmsCargo,group='',child='')=>rows.push([group,child,item.number,date(item.received),item.customer,item.receiver,item.sender||'',item.places,item.weight,item.volume,item.paidWeight,date(item.plannedDeliveryDate),actual.has(item.number)?'Отправлена':'Не отправлена',date(item.slaDeadline?.slice(0,10)),item.slaPlanDays??null]);
 const ordered=(items:TmsCargo[])=>[...items].sort((a,b)=>a.number.localeCompare(b.number,'ru',{numeric:true}));
 if(view==='cargo')ordered(cargo).forEach(item=>append(item));
 else for(const group of groupPickerHierarchy(cargo,view))for(const child of group.children||[])ordered(child.cargo).forEach(item=>append(item,group.label,child.label));
 return rows;
}
export async function createPlanningExcel(input:PlanningExport):Promise<Blob> {
 const XLSX=await import('xlsx'),{draft,cargo,actual,ferryName,view}=input;
 const sum=(field:'weight'|'volume'|'places'|'paidWeight')=>cargo.some(item=>item[field]!=null)?cargo.reduce((total,item)=>total+(item[field]??0),0):null;
 const completed=cargo.filter(item=>actual.has(item.number)).length,vehicle=planningVehicle(draft);
 const summary:unknown[][]=[['План отправки'],['Дата планирования',date(draft.date)],['Маршрут',draft.route],['Тип транспорта',MODE_LABELS[draft.mode]],['Тип ТС',vehicleName(draft.vehicleId)],['Паром',ferryName],['Дата выхода',date(draft.departureDate)],['Вид',PICKER_VIEWS.find(item=>item.value===view)?.label],['Комментарий',draft.comment],[],['Перевозок',cargo.length],['Мест',sum('places')],['Вес, кг',sum('weight')],['Объём, м³',sum('volume')],['Платный вес, кг',sum('paidWeight')],['Факт отправки',completed],['Исполнение, %',cargo.length?Math.round(completed/cargo.length*100):0]];
 if(vehicle)summary.push(['Грузоподъёмность, кг',vehicle.payload],['Вместимость, м³',vehicle.volume]);
 if(draft.vehicleDimensions)summary.push(['Внутренняя длина, м',draft.vehicleDimensions.length],['Внутренняя ширина, м',draft.vehicleDimensions.width],['Внутренняя высота, м',draft.vehicleDimensions.height]);
 const book=XLSX.utils.book_new(),meta=XLSX.utils.aoa_to_sheet(summary,{cellDates:true}),sheet=XLSX.utils.aoa_to_sheet(planningExportRows(input),{cellDates:true});
 meta['!cols']=[{wch:28},{wch:64}];sheet['!cols']=[30,24,16,22,36,36,36,12,16,16,19,25,20,22,14].map(wch=>({wch}));
 sheet['!autofilter']={ref:sheet['!ref']!};
 for(const worksheet of [meta,sheet])for(const [key,value] of Object.entries(worksheet))if(!key.startsWith('!')&&value.t==='d')value.z='dd.mm.yyyy';
 XLSX.utils.book_append_sheet(book,meta,'План');XLSX.utils.book_append_sheet(book,sheet,'Перевозки');
 return new Blob([XLSX.write(book,{type:'array',bookType:'xlsx'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

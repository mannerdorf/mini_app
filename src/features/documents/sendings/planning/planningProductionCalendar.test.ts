import {expect,it} from 'vitest';
import {productionCalendarDay} from './planningProductionCalendar';
const day=(date:string)=>productionCalendarDay(new Date(`${date}T12:00:00`));

it('matches the official annual and monthly working-day totals for 2025–2027',()=>{
 const expected:Record<number,number[]>={
  2025:[17,20,21,22,18,19,23,21,22,23,19,22],
  2026:[15,19,21,22,19,21,23,21,22,22,20,22],
  2027:[15,19,22,22,19,21,22,22,22,21,20,22],
 };
 for(const [year,months] of Object.entries(expected)){
  const actual=months.map((_,month)=>{
   const days=new Date(Number(year),month+1,0).getDate();
   return Array.from({length:days},(_,index)=>productionCalendarDay(new Date(Number(year),month,index+1))).filter(day=>!day.isDayOff).length;
  });
  expect(actual).toEqual(months);
  expect(actual.reduce((sum,value)=>sum+value,0)).toBe(247);
 }
});
it('keeps ordinary weekdays working and includes holidays and transferred weekdays',()=>{
 expect(day('2026-10-09').isDayOff).toBe(false);
 expect(day('2026-10-10').isDayOff).toBe(true);
 expect(day('2026-10-11').isDayOff).toBe(true);
 expect(day('2026-11-04').description).toContain('День народного единства');
 for(const date of ['2026-01-09','2026-03-09','2026-05-11','2026-12-31']){
  expect(day(date).isDayOff).toBe(true);
  expect(day(date).description).toContain('Перенесённый выходной');
 }
 expect(day('2026-01-12').isDayOff).toBe(false);
 expect(day('2026-12-30').isDayOff).toBe(false);
});
it('honours working Saturdays and does not invent automatic Monday transfers overridden by the government',()=>{
 for(const date of ['2025-11-01','2027-02-20']){
  expect(day(date).isDayOff).toBe(false);
  expect(day(date).description).toContain('Рабочая суббота');
 }
 for(const date of ['2025-11-03','2027-02-22','2027-11-05'])expect(day(date).isDayOff).toBe(true);
 expect(day('2025-02-24').isDayOff).toBe(false);
 expect(day('2025-03-10').isDayOff).toBe(false);
});
it('uses each date’s own year across December/January and labels the fallback for unknown years',()=>{
 expect(day('2026-12-31').isDayOff).toBe(true);
 expect(day('2027-01-01').description).toContain('Новогодние каникулы');
 expect(day('2027-01-07').description).toContain('Рождество Христово');
 expect(day('2027-01-11').isDayOff).toBe(false);
 expect(day('2028-01-01')).toMatchObject({isDayOff:true,confirmed:false});
 expect(day('2028-01-01').description).toContain('ежегодные переносы не учтены');
 expect(day('2028-02-29').isDayOff).toBe(false);
});

type YearTransfers = { daysOff: Record<string,string>; workingWeekends: Record<string,string> };

// Federal production calendar, five-day week. Annual transfers must be updated
// from the adopted government resolution; unknown years use only base days.
// 2025: Resolution 04.10.2024 No. 1335, https://government.ru/docs/52895/
// 2026: Resolution 24.09.2025 No. 1466,
// https://static.government.ru/media/files/4jeB8hNKm69ggOa9yDiYOli6YoAyM21i.pdf
// 2027: Resolution 17.09.2026 No. 1187,
// https://publication.pravo.gov.ru/document/0001202609180037
// Automatic holiday/weekend transfers: Labour Code, Article 112.
const TRANSFERS: Record<number,YearTransfers> = {
  2025: {
    daysOff: {'05-02':'01-04','05-08':'02-23','06-13':'03-08','11-03':'11-01','12-31':'01-05'},
    workingWeekends: {'11-01':'11-03'},
  },
  2026: {
    daysOff: {'01-09':'01-03','03-09':'03-08','05-11':'05-09','12-31':'01-04'},
    workingWeekends: {},
  },
  2027: {
    daysOff: {'02-22':'02-20','05-03':'05-01','05-10':'05-09','06-14':'06-12','11-05':'01-02','12-31':'01-03'},
    workingWeekends: {'02-20':'02-22'},
  },
};

const HOLIDAYS: Record<string,string> = {
  '01-01':'Новогодние каникулы','01-02':'Новогодние каникулы','01-03':'Новогодние каникулы',
  '01-04':'Новогодние каникулы','01-05':'Новогодние каникулы','01-06':'Новогодние каникулы',
  '01-07':'Рождество Христово','01-08':'Новогодние каникулы',
  '02-23':'День защитника Отечества','03-08':'Международный женский день',
  '05-01':'Праздник Весны и Труда','05-09':'День Победы',
  '06-12':'День России','11-04':'День народного единства',
};
const readableDay = (day:string) => day.split('-').reverse().join('.');

export function productionCalendarDay(date:Date) {
  const key = `${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const transfers = TRANSFERS[date.getFullYear()];
  const holiday = HOLIDAYS[key], transferredFrom = transfers?.daysOff[key], workingInsteadOf = transfers?.workingWeekends[key];
  const weekend = date.getDay() === 0 || date.getDay() === 6;
  const isDayOff = !!holiday || !!transferredFrom || (weekend && !workingInsteadOf);
  const label = holiday ? `Праздничный день: ${holiday}`
    : transferredFrom ? `Перенесённый выходной с ${readableDay(transferredFrom)}`
    : workingInsteadOf ? `Рабочая суббота: перенос выходного на ${readableDay(workingInsteadOf)}`
    : weekend ? 'Выходной день' : 'Рабочий день';
  return {
    isDayOff,
    confirmed: !!transfers,
    description: `${label} · производственный календарь РФ, пятидневная неделя${transfers?'':' · ежегодные переносы не учтены'}`,
  };
}

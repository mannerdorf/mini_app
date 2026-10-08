import { it, expect } from "vitest";
import { readiness, normalizeCargo, terminal, amount } from "./backlog";
it("uses synchronized receipt data, not an upstream history request", () => {
  expect(readiness({ DatePrih: "2026-10-07", State: "В пути" }).readiness).toBe(
    "ready",
  );
  for (const DatePrih of [null, "", "0001-01-01", "invalid"])
    expect(readiness({ DatePrih, State: "В пути" }).readiness).toBe(
      "unreceived",
    );
  expect(
    readiness({ DatePrih: "2026-10-07", State: "Доставлена" }).readiness,
  ).toBe("dispatched");
});
it("normalizes actual rather than billable weight and does not invent pallets", () => {
  const c = normalizeCargo(
    {
      Number: "000142978",
      INN: "1",
      Customer: "Клиент",
      Sender: " Отправитель ",
      Receiver: "Получатель",
      W: "106,50",
      PW: 280,
      Value: "1.40",
      Mest: 10,
      DatePrih: "2026-10-07",
      CitySender: "Москва",
      CityReceiver: "Калининград",
    },
    null,
  );
  expect(c.weight).toBe(106.5);
  expect(c.paidWeight).toBe(280);
  expect(normalizeCargo({ W: 100, Value: 2 }, null).paidWeight).toBeNull();
  expect(c.route).toBe("MSK → KGD");
  expect(c.number).toBe("142978");
  expect(c.received).toBe("2026-10-07");
  expect(c.sender).toBe("Отправитель");
  expect(c.receiver).toBe("Получатель");
  expect(normalizeCargo({Customer: 'Клиент', Receiver: 'Получатель'}, null).sender).toBe('');
  expect(amount("")).toBeNull();
  expect(amount("no")).toBeNull();
});
it("excludes delivered records even with an outdated summary", () => {
  expect(terminal({ State: "В пути", DateVr: "2026-10-01" })).toBe(true);
  expect(terminal({ State: "Готово к выдаче" })).toBe(true);
  expect(terminal({ State: "В пути", DateVr: "0001-01-01" })).toBe(false);
});

it('excludes sending members with padded numbers directly in the database, across customers and dates', async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const {readBacklog}=await import('./backlog');
  const db=new PGlite();
  try {
    await db.exec('CREATE TABLE sendings_metrics(cargo_numbers jsonb); CREATE TABLE cache_perevozki_rows(doc_number text,doc_date timestamp,payload jsonb,updated_at timestamp);');
    await db.query('INSERT INTO sendings_metrics VALUES ($1)',[JSON.stringify([' 000142943 '])]);
    const records=[
      {Number:'142943',DatePrih:'2026-10-06',State:'В пути',INN:'other'},
      {Number:'000142945',DatePrih:'2026-10-06',State:'В пути'},
      {Number:'142946',DatePrih:'2026-10-06',State:'Доставлена'},
      {Number:'142947',DatePrih:'2026-10-06',State:'В пути',DateVr:'2026-10-07'},
      {Number:'142948',DatePrih:'2025-09-01',State:'В пути'},
    ];
    for(const r of records)await db.query('INSERT INTO cache_perevozki_rows VALUES ($1,$2,$3,now())',[r.Number,r.DatePrih,JSON.stringify(r)]);
    const result=await readBacklog(db as any);
    expect(result.assigned).toBe(1);expect(result.rows.map(r=>r.payload.Number)).toEqual(['000142945','142948']);
  }finally{await db.close();}
}, 30000);

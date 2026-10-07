import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { respondCorsPreflight } from "./_lib/cors.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { resolveCompanyAccess, CompanyAccessError } from "../lib/companyAccess.js";
import { readPerevozkiByNumbersFromCache } from "../lib/documentCacheRead.js";
import { perevozkiCustomerInn, resolvePerevozkiRolesForInns } from "../lib/perevozkiPartyMatch.js";


export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (respondCorsPreflight(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: "Некорректный запрос" }); }
  const { login, password, number, customerInn } = body ?? {};
  if (typeof number !== "string" || !number.trim() || number.length > 100 || typeof customerInn !== "string" || !customerInn.trim()) {
    return res.status(400).json({ error: "Укажите перевозку и ИНН заказчика" });
  }
  if (typeof login !== "string" || !login.trim() || typeof password !== "string" || !password) {
    return res.status(401).json({ error: "Требуется авторизация" });
  }
  try {
    const pool = getPool();
    const key = login.trim().toLowerCase();
    const registered = await pool.query("SELECT login FROM registered_users WHERE lower(trim(login))=$1", [key]);
    let all = false;
    const inns = new Set<string>();
    if (registered.rows.length) {
      const user = await verifyRegisteredUser(pool, key, password);
      if (!user) return res.status(401).json({ error: "Неверный логин или пароль" });
      all = user.accessAllInns;
      if (user.inn) inns.add(user.inn);
      const companies = await pool.query("SELECT inn FROM account_companies WHERE login=$1", [key]);
      companies.rows.forEach((row) => inns.add(String(row.inn ?? "").trim()));
    } else {
      const access = await resolveCompanyAccess(pool, login, password);
      access.customers.forEach((company) => inns.add(company.inn));
    }
    inns.delete("");
    // Use the stored cargo, never customer/order assignments submitted by the browser.
    const candidates = await readPerevozkiByNumbersFromCache(pool, [number.trim()]);
    const cargo = candidates.filter((item) => perevozkiCustomerInn(item) === customerInn.trim() &&
      (all || resolvePerevozkiRolesForInns(item, inns).length > 0));
    if (cargo.length !== 1) return res.status(404).json({ error: "Перевозка не найдена или нет доступа" });
    const matches = await pool.query<{id:number;name:string;mmsi:string;own:boolean}>(`
      SELECT f.id,f.name,f.mmsi,lower(trim(sf.login))=$3 AS own
      FROM sendings_metrics m
      JOIN sendings_ferry sf ON ltrim(btrim(sf.row_key),'0')=ltrim(btrim(m.sending_number),'0')
        AND (sf.inn=m.customer_inn OR (sf.inn IS NULL AND lower(trim(sf.login))=$3))
      JOIN ferries f ON f.id=sf.ferry_id
      WHERE m.customer_inn=$1 AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(m.cargo_numbers) AS cargo_number(value)
        WHERE ltrim(btrim(cargo_number.value),'0')=ltrim($2,'0')
      ) ORDER BY sf.updated_at DESC`,[perevozkiCustomerInn(cargo[0]),String(cargo[0].Number ?? number).trim(),key]);
    const own=matches.rows.filter(row=>row.own);
    const ferryCandidates=own.length?own:matches.rows;
    const vessels=new Map(ferryCandidates.map(row=>[row.id,row]));
    if(vessels.size>1)return res.status(409).json({error:'Для перевозки указаны разные паромы. Уточните выбор парома в отправках.'});
    const ferry=[...vessels.values()][0];
    return res.status(200).json({ferry:ferry ? {id:ferry.id,name:ferry.name,mmsi:ferry.mmsi} : null});
  } catch (error) {
    return res.status(error instanceof CompanyAccessError ? error.status : 500).json({
      error: error instanceof CompanyAccessError ? error.message : "Не удалось определить паром перевозки. Повторите попытку.",
    });
  }
}

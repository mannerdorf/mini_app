import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "./_db.js";
import { respondCorsPreflight } from "./_lib/cors.js";
import { verifyRegisteredUser } from "../lib/verifyRegisteredUser.js";
import { resolveCompanyAccess, CompanyAccessError } from "../lib/companyAccess.js";
import { readPerevozkiByNumbersFromCache } from "../lib/documentCacheRead.js";
import { perevozkiCustomerInn, resolvePerevozkiRolesForInns } from "../lib/perevozkiPartyMatch.js";
import { cargoHasPickupPhotos } from "../lib/pickup/cargoPhotoIndicator.js";

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
    const jobs = await pool.query("SELECT id, job_number, data FROM pickup_jobs WHERE btrim(data->>'customerInn')=$1", [perevozkiCustomerInn(cargo[0])]);
    const ids = jobs.rows.filter((job) => cargoHasPickupPhotos(cargo[0], [job])).map((job) => job.id);
    if (!ids.length) return res.status(200).json({ photos: [] });
    const photos = await pool.query("SELECT id,content_type,encode(bytes,'base64') AS base64 FROM pickup_photos WHERE job_id=ANY($1::uuid[]) ORDER BY created_at,id", [ids]);
    return res.status(200).json({ photos: photos.rows });
  } catch (error) {
    return res.status(error instanceof CompanyAccessError ? error.status : 500).json({
      error: error instanceof CompanyAccessError ? error.message : "Не удалось загрузить фотографии. Повторите попытку.",
    });
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";

const EXTERNAL_API_BASE_URL =
  "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetFile";

// админский токен из curl
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU=";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { login, password, metod, number } = req.body || {};

if (!login || !password || !metod || !number) {
  return res.status(400).json({
    error: "Нужны поля: login, password, metod, number",
  });
}

// 💡 формируем URL ровно как в твоём примере
const url = `${EXTERNAL_API_BASE_URL}?metod=${metod}&Number=${number}`;
console.log("GetFile URL:", url);

const upstream = await fetch(url, {
  method: "GET",
  headers: {
    Authorization: SERVICE_AUTH,              // "Basic YWRtaW46anVlYmZueWU="
    Auth: `Basic ${login}:${password}`,       // "Basic login:password"
  },
});

const contentType =
  upstream.headers.get("content-type") || "application/octet-stream";
const contentDisposition =
  upstream.headers.get("content-disposition") ||
  `attachment; filename="${encodeURIComponent(`${metod}_${number}.pdf`)}"`;

// Если 1С вернула не 200 — отдаем текст как есть, чтобы было видно, что она отвечает
if (!upstream.ok) {
  const errorBody = await upstream.text().catch(() => "");
  console.error("Upstream error:", upstream.status, errorBody);
  return res.status(upstream.status).send(errorBody);
}

// Если 1С всё же шлёт JSON вместо файла — это тоже увидим
const buffer = Buffer.from(await upstream.arrayBuffer());
res
  .status(200)
  .setHeader("Content-Type", contentType)
  .setHeader("Content-Disposition", contentDisposition)
  .send(buffer);
  } catch (error: any) {
    console.error("Proxy error:", error?.message || error);
    res
      .status(500)
      .json({ error: "Proxy fetch failed", message: error?.message });
  }
}

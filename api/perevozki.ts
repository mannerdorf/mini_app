// /api/perevozki.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { login, password } = req.query;

  if (!login || !password) {
    return res.status(400).json({ error: "Missing login or password" });
  }

  const auth = "Basic " + Buffer.from(`${login}:${password}`).toString("base64");

  try {
    const response = await fetch(
      "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki?DateB=2024-01-01&DateE=2026-01-01",
      {
        method: "GET",
        headers: {
          Authorization: auth
        }
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: "Auth failed" });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (e) {
    return res.status(500).json({ error: "Server error", details: e });
  }
}

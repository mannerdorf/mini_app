import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return res.status(500).json({ 
      error: "Redis config missing", 
      url: !!url, 
      token: !!token 
    });
  }

  try {
    const testKey = "test_connection_" + Date.now();
    const setRes = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["SET", testKey, "ok"],
        ["GET", testKey],
        ["DEL", testKey]
      ]),
    });

    const data = await setRes.json();
    return res.status(200).json({ 
      ok: setRes.ok, 
      status: setRes.status,
      data 
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}

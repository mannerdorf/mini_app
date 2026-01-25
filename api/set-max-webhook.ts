import type { VercelRequest, VercelResponse } from "@vercel/node";
import https from "https";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN;

  if (!MAX_BOT_TOKEN) {
    return res.status(500).json({ error: "MAX_BOT_TOKEN not found in environment variables" });
  }

  const cleanToken = MAX_BOT_TOKEN.trim().replace(/^["']|["']$/g, "");
  const appDomain = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : "https://mini-app-lake-phi.vercel.app";
  
  const webhookUrl = `${appDomain}/api/max-webhook`;

  const body = JSON.stringify({
    url: webhookUrl,
    update_types: ["message_created", "bot_started", "message_callback"],
    secret: process.env.MAX_WEBHOOK_SECRET || "haulz_secret_2026"
  });

  const options = {
    hostname: "platform-api.max.ru",
    path: "/subscriptions",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": cleanToken.startsWith("Bearer ") ? cleanToken : `Bearer ${cleanToken}`,
      "Content-Length": Buffer.byteLength(body),
    },
  };

  try {
    const result = await new Promise((resolve, reject) => {
      const apiReq = https.request(options, (apiRes) => {
        let responseBody = "";
        apiRes.on("data", (chunk) => { responseBody += chunk; });
        apiRes.on("end", () => {
          resolve({
            statusCode: apiRes.statusCode,
            body: responseBody
          });
        });
      });
      apiReq.on("error", (e) => reject(e));
      apiReq.write(body);
      apiReq.end();
    });

    return res.status(200).json({
      message: "Webhook setup attempt finished",
      webhookUrl,
      result
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

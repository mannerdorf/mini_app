import type { VercelRequest, VercelResponse } from "@vercel/node";
import https from "https";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const MAX_BOT_TOKEN = process.env.MAX_BOT_TOKEN;

  if (!MAX_BOT_TOKEN) {
    return res.status(500).json({ error: "MAX_BOT_TOKEN not found in environment variables" });
  }

  const cleanToken = MAX_BOT_TOKEN.trim().replace(/^["']|["']$/g, "");
  // Попробуем без Bearer, если с ним не сработало, 
  // но в первом запросе используем чистый токен или попробуем оба варианта
  
  const body = JSON.stringify({
    url: webhookUrl,
    update_types: ["message_created", "bot_started", "message_callback"],
    secret: process.env.MAX_WEBHOOK_SECRET || "haulz_secret_2026"
  });

  const sendRequest = (authValue: string) => {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "platform-api.max.ru",
        path: "/subscriptions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authValue,
          "Content-Length": Buffer.byteLength(body),
        },
      };

      const apiReq = https.request(options, (apiRes) => {
        let responseBody = "";
        apiRes.on("data", (chunk) => { responseBody += chunk; });
        apiRes.on("end", () => {
          resolve({
            statusCode: apiRes.statusCode,
            body: responseBody,
            authUsed: authValue.substring(0, 10) + "..."
          });
        });
      });
      apiReq.on("error", (e) => reject(e));
      apiReq.write(body);
      apiReq.end();
    });
  };

  try {
    // Попытка 1: С Bearer
    let result: any = await sendRequest(cleanToken.startsWith("Bearer ") ? cleanToken : `Bearer ${cleanToken}`);
    
    // Попытка 2: Если 401, пробуем БЕЗ Bearer
    if (result.statusCode === 401) {
      console.log("401 with Bearer, trying without...");
      result = await sendRequest(cleanToken.replace("Bearer ", ""));
    }

    return res.status(200).json({
      message: "Webhook setup attempt finished",
      webhookUrl,
      result
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}

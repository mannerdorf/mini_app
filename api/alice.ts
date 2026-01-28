import type { VercelRequest, VercelResponse } from "@vercel/node";

const APP_DOMAIN =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://mini-app-lake-phi.vercel.app");
const ALICE_VERIFICATION_CODE = process.env.ALICE_VERIFICATION_CODE || "589570";

async function getRedisValue(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["GET", key]]),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const firstResult = Array.isArray(data) ? data[0] : data;
    if (firstResult?.error) return null;
    const value = firstResult?.result;
    if (value === null || value === undefined) return null;
    return String(value);
  } catch {
    return null;
  }
}

async function setRedisValue(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;

  try {
    const pipeline = ttlSeconds
      ? [["SET", key, value], ["EXPIRE", key, ttlSeconds]]
      : [["SET", key, value]];
    const response = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pipeline),
    });
    if (!response.ok) return false;
    const data = await response.json();
    const firstResult = Array.isArray(data) ? data[0] : data;
    return firstResult?.result === "OK" || firstResult?.result === true;
  } catch {
    return false;
  }
}

function getCommandText(reqBody: any): string {
  const raw = reqBody?.request?.command || reqBody?.request?.original_utterance || "";
  return String(raw || "").toLowerCase().trim();
}

function extractCode(text: string) {
  const match = text.match(/\b\d{4,6}\b/);
  return match ? match[0] : null;
}

function aliceResponse(text: string, session_state?: any) {
  return {
    version: "1.0",
    response: {
      text,
      end_session: false,
    },
    session_state,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body;
  const userId = String(body?.session?.user?.user_id || body?.session?.user_id || "anon");
  const text = getCommandText(body);

  if (text.includes("код проверки") || text.includes("проверка навыка") || text.includes("verification")) {
    return res.status(200).json(aliceResponse(`Код проверки: ${ALICE_VERIFICATION_CODE}`));
  }
  // Привязка по коду
  const code = extractCode(text);
  if (code) {
    const raw = await getRedisValue(`alice:link:${code}`);
    if (!raw) {
      return res.status(200).json(aliceResponse("Код не найден или истек. Получите новый код в мини‑приложении."));
    }
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (!parsed?.login || !parsed?.password) {
      return res.status(200).json(aliceResponse("Не удалось прочитать данные привязки. Получите новый код."));
    }
    await setRedisValue(`alice:bind:${userId}`, JSON.stringify(parsed));
    return res
      .status(200)
      .json(aliceResponse("Готово! Аккаунт привязан. Спросите: «какие перевозки в пути» или «какие счета на оплату»."));
  }

  const bindRaw = await getRedisValue(`alice:bind:${userId}`);
  if (!bindRaw) {
    return res
      .status(200)
      .json(aliceResponse("Сначала привяжите аккаунт. Откройте мини‑приложение, получите код и скажите его мне."));
  }

  let bind: any = null;
  try {
    bind = JSON.parse(bindRaw);
  } catch {
    bind = null;
  }
  if (!bind?.login || !bind?.password) {
    return res
      .status(200)
      .json(aliceResponse("Привязка повреждена. Получите новый код в мини‑приложении."));
  }

  const withTimeout = async <T>(promise: Promise<T>, ms: number) => {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timeout")), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  };

  try {
    // Обновляем данные и записываем в RAG
    const today = new Date();
    const dateTo = today.toISOString().split("T")[0];
    const from = new Date();
    from.setMonth(from.getMonth() - 6);
    const dateFrom = from.toISOString().split("T")[0];
    await withTimeout(fetch(`${APP_DOMAIN}/api/perevozki`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: bind.login, password: bind.password, dateFrom, dateTo }),
    }), 2500);

    const chatRes = await withTimeout(fetch(`${APP_DOMAIN}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: `alice_${userId}`,
        userId: String(userId),
        message: text,
        customer: bind?.customer || undefined,
        auth: { login: bind.login, password: bind.password },
        channel: "alice",
        model: "gpt-4o",
      }),
    }), 2500);
    if (chatRes.ok) {
      const data = await chatRes.json();
      if (data?.reply) {
        return res.status(200).json(aliceResponse(String(data.reply)));
      }
    }
  } catch {
    // ignore and fall through to default
  }

  return res
    .status(200)
    .json(
      aliceResponse(
        "Запрос обрабатывается дольше обычного. Повторите запрос через несколько секунд."
      )
    );
}

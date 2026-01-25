import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Диагностический endpoint для проверки подключения к Upstash Redis
 * GET /api/test-redis
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  const diagnostics: any = {
    hasUrl: !!url,
    hasToken: !!token,
    urlPrefix: url ? url.substring(0, 20) + "..." : null,
    tokenPrefix: token ? token.substring(0, 10) + "..." : null,
  };

  if (!url || !token) {
    return res.status(200).json({
      status: "not_configured",
      message: "Upstash Redis environment variables are not set",
      diagnostics,
    });
  }

  try {
    // Тест: SET и GET
    const testKey = `test:${Date.now()}`;
    const testValue = "test_value";

    // SET
    const setResponse = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["SET", testKey, testValue]]),
    });

    if (!setResponse.ok) {
      const text = await setResponse.text();
      return res.status(200).json({
        status: "error",
        message: "Failed to SET value",
        diagnostics: {
          ...diagnostics,
          setStatus: setResponse.status,
          setError: text,
        },
      });
    }

    const setData = await setResponse.json();
    const setResult = Array.isArray(setData) ? setData[0] : setData;

    // GET
    const getResponse = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["GET", testKey]]),
    });

    if (!getResponse.ok) {
      const text = await getResponse.text();
      return res.status(200).json({
        status: "error",
        message: "Failed to GET value",
        diagnostics: {
          ...diagnostics,
          setResult: setResult?.result,
          getStatus: getResponse.status,
          getError: text,
        },
      });
    }

    const getData = await getResponse.json();
    const getResult = Array.isArray(getData) ? getData[0] : getData;

    // Очистка
    await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["DEL", testKey]]),
    });

    return res.status(200).json({
      status: "success",
      message: "Redis connection is working",
      diagnostics: {
        ...diagnostics,
        setResult: setResult?.result,
        getResult: getResult?.result,
        valueMatches: getResult?.result === testValue,
      },
    });
  } catch (error: any) {
    return res.status(200).json({
      status: "error",
      message: "Exception during Redis test",
      diagnostics: {
        ...diagnostics,
        error: error?.message || String(error),
      },
    });
  }
}

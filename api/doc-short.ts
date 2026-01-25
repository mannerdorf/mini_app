import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Короткая ссылка на документ, которая открывает мини-апп
 * GET /api/doc-short?metod=ЭР&number=12345
 * 
 * Этот endpoint редиректит на мини-апп с параметрами для скачивания документа
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const metod = req.query.metod as string;
  const number = req.query.number as string;

  if (!metod || !number) {
    return res.status(400).json({ error: "metod and number are required" });
  }

  // Определяем URL мини-аппа
  const appDomain = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : process.env.NEXT_PUBLIC_APP_URL || "https://<твой-домен>";

  // Редирект на мини-апп с параметрами
  // Мини-апп должен обработать эти параметры и открыть модальное окно для скачивания
  const redirectUrl = `${appDomain}/?doc=${encodeURIComponent(metod)}&number=${encodeURIComponent(number)}`;

  // HTML страница с редиректом и инструкцией
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Скачать документ</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 400px;
    }
    .spinner {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #0070f3;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    a {
      color: #0070f3;
      text-decoration: none;
      margin-top: 20px;
      display: inline-block;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>Открываем мини-приложение...</h2>
    <div class="spinner"></div>
    <p>Если приложение не открылось автоматически:</p>
    <a href="${redirectUrl}">Нажмите здесь</a>
  </div>
  <script>
    // Автоматический редирект
    setTimeout(() => {
      window.location.href = "${redirectUrl}";
    }, 500);
  </script>
</body>
</html>`;

  return res.status(200).send(html);
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import fetch from "node-fetch"; 
import { Buffer } from "buffer";

// URL внешнего API 1С для получения файла
const EXTERNAL_API_BASE_URL = "https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetFile";

// Сервисный Basic-auth: admin:juebfnye (Base64-кодированный)
const SERVICE_AUTH = "Basic YWRtaW46anVlYmZueWU="; 

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    // 1. Чтение JSON из body (аналогично старому рабочему perevozki)
    let body: any = req.body;
    if (typeof body === "string") {
        try {
            body = JSON.parse(body);
        } catch {
            return res.status(400).json({ error: "Invalid JSON body" });
        }
    }

    const {
        login,
        password,
        metod, // Например, 'ЭР' (Электронная Регистрация)
        Number, // Номер груза
    } = body || {};

    if (!login || !password || !metod || !Number) {
        return res.status(400).json({ error: "login, password, metod, and Number are required" });
    }

    // 2. Формирование URL с параметрами
    const url = new URL(EXTERNAL_API_BASE_URL);
    // Для кириллицы (ЭР) лучше использовать encodeURIComponent
    url.searchParams.set("metod", metod); 
    url.searchParams.set("Number", Number);

    try {
        // 3. Запрос к внешнему API с ДВОЙНОЙ авторизацией
        const upstream = await fetch(url.toString(), {
            method: "GET", 
            headers: {
                // Auth (Client) - RAW credentials
                'Auth': `Basic ${login}:${password}`, 
                // Authorization (Admin) - BASE64 credentials
                'Authorization': SERVICE_AUTH,
            },
        });

        // 4. Обработка ошибок
        if (!upstream.ok) {
            const errorText = await upstream.text();
            return res.status(upstream.status).send(
                errorText || {
                    error: `Upstream error: ${upstream.status}`,
                }
            );
        }

        // 5. Передача заголовков файла и данных
        const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
        // Пытаемся сохранить оригинальное имя файла или используем сгенерированное
        const contentDisposition = upstream.headers.get('content-disposition') || `attachment; filename="${Number}_${metod}.pdf"`;
        
        // Устанавливаем заголовки для скачивания
        res.status(200)
           .setHeader('Content-Type', contentType)
           .setHeader('Content-Disposition', contentDisposition);

        // Передаем тело ответа (бинарные данные)
        const buffer = await upstream.arrayBuffer();
        res.send(Buffer.from(buffer));
        
    } catch (error: any) {
        console.error('Proxy error:', error?.message || error);
        res.status(500).json({ error: 'Proxy fetch failed' });
    }
}

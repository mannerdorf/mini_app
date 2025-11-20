import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

// --- КОНФИГУРАЦИЯ ВНЕШНЕГО API ---
// Используем ваш реальный URL из запроса Postman
const EXTERNAL_API_URL = 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki';

/**
 * Обработчик для прокси-запросов.
 * Принимает GET-запрос от фронтенда, извлекает заголовок Authorization: Basic,
 * и перенаправляет запрос с этим заголовком на внешний API 1С.
 */
export default async function handler(
    req: VercelRequest,
    res: VercelResponse,
) {
    // Разрешаем только GET-запросы
    if (req.method !== 'GET') {
        console.log(`Method Not Allowed: ${req.method}`);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const authHeader = req.headers.authorization;
    
    // Проверка наличия заголовка авторизации
    if (!authHeader || !authHeader.startsWith('Basic ')) {
        console.log('Authorization header missing or invalid format.');
        return res.status(401).json({ error: 'Authorization required' });
    }

    try {
        // Извлечение Base64 части
        const userAuthBase64 = authHeader.replace('Basic ', '').trim();
        
        // --- ДЕКОДИРОВАНИЕ ДЛЯ ЛОГИРОВАНИЯ И ПРОВЕРКИ ---
        const decoded = Buffer.from(userAuthBase64, 'base64').toString();
        const [login] = decoded.split(":");
        const cleanLogin = (login || "").trim();

        // --- УСИЛЕННОЕ ЛОГИРОВАНИЕ ДЛЯ ОТЛАДКИ 401 ОШИБКИ ---
        // КРИТИЧЕСКИ ВАЖНО: UpstreamAuthHeader должен совпадать с тем, что работает в Postman
        console.log("PEREVOZKI GET CALL", {
            ReceivedAuthHeader: req.headers.authorization, 
            DecodedLogin: cleanLogin, 
            UpstreamAuthHeader: `Basic ${userAuthBase64}`, 
            query: req.query,
            externalUrl: `${EXTERNAL_API_URL}${req.url?.replace('/api/perevozki', '')}`
        });
        // -----------------------------------------------------------------

        // Формирование URL для внешнего API, включая все query-параметры (DateB, DateE и т.д.)
        const externalUrl = `${EXTERNAL_API_URL}${req.url?.replace('/api/perevozki', '')}`;

        // Выполнение запроса к внешнему API
        const response = await axios.get(externalUrl, {
            headers: {
                // Передача заголовка Basic Auth, который мы получили от клиента
                'Authorization': `Basic ${userAuthBase64}`, 
                // Отключение Gzip, чтобы избежать проблем совместимости с 1С
                'Accept-Encoding': 'identity', 
            },
            timeout: 15000, 
        });

        // Если запрос успешен, возвращаем данные клиенту
        res.status(response.status).json(response.data);
        
    } catch (error: any) {
        console.error('External API Request Failed:', error.message);
        
        // Обработка ошибок, полученных от внешнего API (например, 401)
        if (axios.isAxiosError(error) && error.response) {
            console.error('External API Response Status:', error.response.status);
            
            // Если 401 от 1С, возвращаем 401 клиенту
            return res.status(error.response.status).json(error.response.data || { error: 'External API Error' });
        }

        // Внутренняя ошибка сервера или сети
        res.status(500).json({ error: 'Internal Server Error or Network Issue' });
    }
}

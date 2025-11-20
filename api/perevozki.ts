import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

// 1. URL внешнего API 1С
const EXTERNAL_API_BASE_URL = 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki';

// 2. Admin Basic Auth Header для 1С. Этот заголовок должен быть BASE64-кодирован.
// Значение: 'Basic YWRtaW46anVlYmZueWU=' (admin:juebfnye)
const ADMIN_BASIC_AUTH_HEADER = 'Basic YWRtaW46anVlYmZueWU=';

// --------------------------------------------------------------------------------------

export default async function (req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 1. Получение Base64-кодированного токена клиента из заголовка Authorization фронтенда
    const clientAuthHeader = req.headers.authorization;
    
    if (!clientAuthHeader || !clientAuthHeader.startsWith('Basic ')) {
        return res.status(401).json({ error: 'Authorization header (client) is missing or invalid.' });
    }
    
    // Извлекаем Base64-токен (обрезаем префикс "Basic ")
    const base64Token = clientAuthHeader.substring(6); 
    
    // 2. 🔑 ДЕКОДИРОВАНИЕ: Получение RAW-строки 'login:password' для заголовка Auth
    let rawCredentials;
    try {
        // Используем Node.js Buffer для декодирования Base64
        rawCredentials = Buffer.from(base64Token, 'base64').toString('utf8');
    } catch (e) {
        console.error("Failed to decode base64 token", e);
        return res.status(400).json({ error: 'Invalid Base64 token provided.' });
    }
    
    // 3. Формирование заголовка Auth: 'Basic order@lal-auto.com:ZakaZ656565' (RAW-строка)
    // ВНИМАНИЕ: Формат заголовка 'Auth' в 1С требует RAW-строку login:password
    const clientAuthHeaderFor1C = `Basic ${rawCredentials}`; 

    // 4. Извлечение query параметров от фронтенда (dateFrom, dateTo)
    const { dateFrom, dateTo } = req.query; 

    if (!dateFrom || !dateTo) {
        return res.status(400).json({ error: 'Missing dateFrom or dateTo query parameters.' });
    }

    try {
        // 5. Формирование URL с query параметрами 1С (DateB, DateE)
        const queryParams = new URLSearchParams({
            DateB: dateFrom as string, // Фронтенд: dateFrom -> API 1C: DateB
            DateE: dateTo as string,   // Фронтенд: dateTo   -> API 1C: DateE
        }).toString();
        
        const urlWithParams = `${EXTERNAL_API_BASE_URL}?${queryParams}`;
        
        // 6. Выполнение запроса к 1С с ДВОЙНОЙ авторизацией
        const apiResponse = await axios.get(urlWithParams, {
            headers: {
                // Заголовок Auth (Client) - RAW credentials
                'Auth': clientAuthHeaderFor1C, 
                
                // Заголовок Authorization (Admin) - BASE64 credentials
                'Authorization': ADMIN_BASIC_AUTH_HEADER,
                
                // 🛑 ИСПРАВЛЕНИЕ: Отключаем автоматическое сжатие (gzip) Axios/Vercel
                'Accept-Encoding': 'identity', 
                
                'Content-Type': 'application/json',
            },
            // Важно: не выбрасываем исключение на 4xx/5xx, чтобы пробросить статус 1С на фронтенд
            validateStatus: () => true, 
        });

        // 7. Проброс статуса и данных как есть
        res
          .status(apiResponse.status)
          .setHeader('Content-Type', apiResponse.headers['content-type'] || 'application/json')
          .send(apiResponse.data);

    } catch (error: any) {
        console.error('Proxy error:', error?.message || error);
        // Возвращаем 500 в случае ошибки сети или сбоя прокси
        res.status(500).json({ error: 'Proxy internal error', details: error?.message || String(error) });
    }
}

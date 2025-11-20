import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

// --- URL и Даты из рабочего запроса Postman ---
const HARDCODED_EXTERNAL_URL = 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki?DateB=2024-12-11&DateE=2026-01-01'; // Точные рабочие даты

// --- 1. АДМИНСКИЙ ТОКЕН (Authorization: Base64) ---
// Соответствует: --header 'Authorization: Basic YWRtaW46anVlYmZueWU='
const ADMIN_AUTH_HEADER = 'Basic YWRtaW46anVlYmZueWU='; 

// --- 2. КЛИЕНТСКИЙ ТОКЕН (Auth: НЕКОДИРОВАННЫЙ логин:пароль) ---
// Соответствует: --header 'Auth: Basic order@lal-auto.com:ZakaZ656565'
const CLIENT_AUTH_RAW_VALUE = 'Basic order@lal-auto.com:ZakaZ656565'; 

/**
 * ПРОКСИ: ТОЧНАЯ КОПИЯ РАБОЧЕГО ЗАПРОСА.
 * Устраняет проблему с нестандартным, незакодированным заголовком 'Auth'.
 */
export default async function handler(
    req: VercelRequest,
    res: VercelResponse,
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    // Проверка наличия заголовка Authorization (для Vercel)
    if (!req.headers.authorization) { 
        return res.status(401).json({ error: 'Authorization required' });
    }

    try {
        console.log("PEREVOZKI GET CALL - FINAL PURE REPLICA", {
            TargetURL: HARDCODED_EXTERNAL_URL,
            AuthorizationHeader: ADMIN_AUTH_HEADER, 
            AuthHeader: CLIENT_AUTH_RAW_VALUE, 
            Message: "Отправляется максимально точная копия рабочего запроса."
        });

        const response = await axios.get(HARDCODED_EXTERNAL_URL, {
            headers: {
                // АДМИНСКИЙ ТОКЕН (Кодированный)
                'Authorization': ADMIN_AUTH_HEADER, 
                
                // КЛИЕНТСКИЙ ТОКЕН (НЕКОДИРОВАННЫЙ)
                'Auth': CLIENT_AUTH_RAW_VALUE,
            },
            timeout: 15000, 
        });

        // Возвращаем успешный ответ от 1С клиенту
        res.status(response.status).json(response.data);
        
    } catch (error: any) {
        console.error('External API Request Failed:', error.message);
        
        if (axios.isAxiosError(error) && error.response) {
            console.error('External API Response Status:', error.response.status);
            // Возвращаем клиенту ошибку, полученную от 1С
            return res.status(error.response.status).json(error.response.data || { error: 'External API Error' });
        }

        res.status(500).json({ error: 'Internal Server Error or Network Issue' });
    }
}

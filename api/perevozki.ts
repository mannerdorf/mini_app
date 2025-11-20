import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

// --- КОНФИГУРАЦИЯ ВНЕШНЕГО API (ЖЕСТКО ЗАДАННЫЙ РАБОЧИЙ URL) ---
const HARDCODED_EXTERNAL_URL = 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki?DateB=2024-12-11&DateE=2026-01-01';

// --- СЛУЖЕБНЫЕ ДАННЫЕ АДМИНИСТРАТОРА (для 'Authorization') ---
// admin:juebfnye -> YWRtaW46anVlYmZueWU=
const ADMIN_AUTH_HEADER = 'Basic YWRtaW46anVlYmZueWU='; 

// --- ДАННЫЕ КЛИЕНТА (для 'Auth') ---
// !!! ВНИМАНИЕ: СТРОГОЕ СООТВЕТСТВИЕ POSTMAN-У !!!
// Мы отправляем незакодированный логин:пароль, хотя это нарушает стандарт Basic Auth.
// Если 1С этого требует, Axios должен это отправить.
const CLIENT_AUTH_RAW_VALUE = 'Basic order@lal-auto.com:ZakaZ656565'; 

/**
 * ПРОКСИ ДЛЯ АБСОЛЮТНОЙ ТОЧНОСТИ (Версия с незакодированным 'Auth').
 * Использует жёсткий URL и жёстко заданные рабочие заголовки из Postman.
 */
export default async function handler(
    req: VercelRequest,
    res: VercelResponse,
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    // Прокси-функция должна убедиться, что клиент прислал что-то в заголовке Authorization
    if (!req.headers.authorization) { 
        return res.status(401).json({ error: 'Authorization required' });
    }

    try {
        console.log("PEREVOZKI GET CALL - FINAL RAW AUTH DEBUG", {
            TargetURL: HARDCODED_EXTERNAL_URL,
            AuthorizationHeader: ADMIN_AUTH_HEADER, 
            AuthHeader: CLIENT_AUTH_RAW_VALUE, // *** Незакодированное значение ***
            Message: "Используется незакодированный клиентский Auth-токен (Raw Value) для абсолютной точности."
        });

        const response = await axios.get(HARDCODED_EXTERNAL_URL, {
            headers: {
                // 1. АДМИНСКИЙ ТОКЕН идет в 'Authorization'
                'Authorization': ADMIN_AUTH_HEADER, 
                
                // 2. КЛИЕНТСКИЙ ТОКЕН идет в 'Auth' (незакодированный)
                'Auth': CLIENT_AUTH_RAW_VALUE, 
                
                'Accept-Encoding': 'identity', 
            },
            timeout: 15000, 
        });

        res.status(response.status).json(response.data);
        
    } catch (error: any) {
        console.error('External API Request Failed:', error.message);
        
        if (axios.isAxiosError(error) && error.response) {
            console.error('External API Response Status:', error.response.status);
            return res.status(error.response.status).json(error.response.data || { error: 'External API Error' });
        }

        res.status(500).json({ error: 'Internal Server Error or Network Issue' });
    }
}

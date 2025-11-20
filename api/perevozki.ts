import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

// --- КОНФИГУРАЦИЯ ВНЕШНЕГО API (ЖЕСТКО ЗАДАННЫЙ РАБОЧИЙ URL) ---
const HARDCODED_EXTERNAL_URL = 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki?DateB=2024-12-11&DateE=2026-01-01';

// --- СЛУЖЕБНЫЕ ДАННЫЕ АДМИНИСТРАТОРА (для 'Authorization') ---
// admin:juebfnye -> YWRtaW46anVlYmZueWU=
const ADMIN_AUTH_HEADER = 'Basic YWRtaW46anVlYmZueWU='; 

// --- ДАННЫЕ КЛИЕНТА (для 'Auth') ---
// order@lal-auto.com:ZakaZ656565 -> b3JkZXJAbGFsLWF1dG8uY29tOlpha2FaNjU2NTY1
// Мы кодируем этот пароль, чтобы его принял Axios и 1С, т.к. Axios не примет незакодированный логин:пароль в заголовке
const CLIENT_AUTH_BASE64_FOR_AUTH_HEADER = 'Basic b3JkZXJAbGFsLWF1dG8uY29tOlpha2FaNjU2NTY1';

/**
 * ПРОКСИ ДЛЯ АБСОЛЮТНОЙ ТОЧНОСТИ:
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
        console.log("PEREVOZKI GET CALL - ABSOLUTE POSTMAN REPLICA", {
            TargetURL: HARDCODED_EXTERNAL_URL,
            AuthorizationHeader: ADMIN_AUTH_HEADER, 
            AuthHeader: CLIENT_AUTH_BASE64_FOR_AUTH_HEADER,
            Message: "Используются жестко заданные URL и заголовки, как в рабочем Postman-запросе."
        });

        const response = await axios.get(HARDCODED_EXTERNAL_URL, {
            headers: {
                // 1. АДМИНСКИЙ ТОКЕН идет в 'Authorization' (как в вашем рабочем CURL)
                'Authorization': ADMIN_AUTH_HEADER, 
                
                // 2. КЛИЕНТСКИЙ ТОКЕН идет в 'Auth' (как в вашем рабочем CURL)
                'Auth': CLIENT_AUTH_BASE64_FOR_AUTH_HEADER, 
                
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

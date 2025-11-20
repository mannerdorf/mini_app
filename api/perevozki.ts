import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

// --- КОНФИГУРАЦИЯ ВНЕШНЕГО API ---
const EXTERNAL_API_URL = 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki';

// --- СЛУЖЕБНЫЕ ДАННЫЕ ДЛЯ АВТОРИЗАЦИИ ПРОКСИ В 1С (ЗАШИТЫЕ) ---
// YWRtaW46anVlYmZueWU= декодируется в admin:juebfnye
const ADMIN_AUTH_BASE64 = 'YWRtaW46anVlYmZueWU='; 
const ADMIN_AUTH_HEADER = `Basic ${ADMIN_AUTH_BASE64}`;

/**
 * Обработчик для прокси-запросов.
 * Пересылает клиентские данные в заголовке 'Auth' и добавляет служебные данные в 'Authorization'.
 */
export default async function handler(
    req: VercelRequest,
    res: VercelResponse,
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const clientAuthHeader = req.headers.authorization;
    
    // Проверка наличия заголовка авторизации от клиента
    if (!clientAuthHeader || !clientAuthHeader.startsWith('Basic ')) {
        return res.status(401).json({ error: 'Authorization required' });
    }

    // Извлечение Base64 части, которую предоставил клиент (order@lal-auto.com:ZakaZ656565)
    const clientAuthBase64 = clientAuthHeader.replace('Basic ', '').trim();
    
    try {
        const decoded = Buffer.from(clientAuthBase64, 'base64').toString();
        const [clientLogin] = decoded.split(":");

        // --- УСИЛЕННОЕ ЛОГИРОВАНИЕ ДЛЯ ОТЛАДКИ 401 ОШИБКИ ---
        console.log("PEREVOZKI GET CALL - DUAL AUTH MODE", {
            ClientLoginDecoded: clientLogin, 
            ClientAuthSentAs_Auth_Header: `Basic ${clientAuthBase64}`, // Заголовок клиента
            AdminAuthSentAs_Authorization_Header: ADMIN_AUTH_HEADER,     // Служебный заголовок
            query: req.query,
        });
        // --------------------------------------------------------

        // Формирование URL для внешнего API, включая все query-параметры
        const externalUrl = `${EXTERNAL_API_URL}${req.url?.replace('/api/perevozki', '')}`;

        // Выполнение запроса к внешнему API
        const response = await axios.get(externalUrl, {
            headers: {
                // 1. СЛУЖЕБНЫЙ ЗАГОЛОВОК (для прокси доступа к 1С)
                'Authorization': ADMIN_AUTH_HEADER, 
                
                // 2. КЛИЕНТСКИЙ ЗАГОЛОВОК (данные клиента, отправленные в заголовке 'Auth', как в Postman)
                'Auth': `Basic ${clientAuthBase64}`, 

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

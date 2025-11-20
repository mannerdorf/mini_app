import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { URLSearchParams } from 'url'; // Импортируем для надежного построения строки параметров

// --- КОНФИГУРАЦИЯ ВНЕШНЕГО API (Только базовый URL) ---
const EXTERNAL_API_BASE_URL = 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki';

// --- СЛУЖЕБНЫЕ ДАННЫЕ ДЛЯ АВТОРИЗАЦИИ ПРОКСИ В 1С (ЗАШИТЫЕ) ---
const ADMIN_AUTH_BASE64 = 'YWRtaW46anVlYmZueWU=';
const ADMIN_AUTH_HEADER = `Basic ${ADMIN_AUTH_BASE64}`;

/**
 * Обработчик для прокси-запросов.
 * Исправлена логика получения Query Parameters с использованием req.query.
 */
export default async function handler(
    req: VercelRequest,
    res: VercelResponse,
) {
    if (req.method !== 'GET') {
        console.log(`Method Not Allowed: ${req.method}`);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const clientAuthHeader = req.headers.authorization;

    if (!clientAuthHeader || !clientAuthHeader.startsWith('Basic ')) {
        console.log('Authorization header missing or invalid format.');
        return res.status(401).json({ error: 'Authorization required' });
    }

    const clientAuthBase64 = clientAuthHeader.replace('Basic ', '').trim();

    try {
        const decoded = Buffer.from(clientAuthBase64, 'base64').toString();
        const [clientLogin] = decoded.split(":");
        
        // --- ИСПРАВЛЕНИЕ: Использование req.query для надежного получения параметров ---
        // 1. Создаем объект URLSearchParams из req.query
        const params = new URLSearchParams(req.query as Record<string, string>);
        
        // 2. ВАЖНО: Переименовываем параметры клиента в формат, который ожидает 1С
        // Фронтенд: dateFrom, dateTo
        // 1С: DateB, DateE
        const dateFrom = params.get('dateFrom');
        const dateTo = params.get('dateTo');
        
        if (dateFrom) {
            params.delete('dateFrom');
            params.set('DateB', dateFrom); 
        }
        if (dateTo) {
            params.delete('dateTo');
            params.set('DateE', dateTo);
        }
        
        // 3. Формируем финальный URL
        const externalUrl = `${EXTERNAL_API_BASE_URL}?${params.toString()}`;

        // --- ЛОГИРОВАНИЕ ДЛЯ ОТЛАДКИ ---
        console.log("PEREVOZKI GET CALL - DUAL AUTH MODE", {
            ClientLoginDecoded: clientLogin, 
            AdminAuthSentAs_Authorization_Header: ADMIN_AUTH_HEADER, 
            ClientAuthSentAs_Auth_Header: `Basic ${clientAuthBase64}`, 
            TargetURL: externalUrl, // Проверьте этот URL в логах!
            ClientQueryReceived: req.query,
            FinalQuerySentTo1C: params.toString(),
        });
        // --------------------------------------------------------

        const response = await axios.get(externalUrl, {
            headers: {
                'Authorization': ADMIN_AUTH_HEADER, 
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
            // Если 1С вернул 401, возвращаем клиенту 401
            return res.status(error.response.status).json(error.response.data || { error: 'External API Error' });
        }

        res.status(500).json({ error: 'Internal Server Error or Network Issue' });
    }
}

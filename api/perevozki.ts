import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

// --- ЖЁСТКО ЗАДАННЫЙ URL С ДАТАМИ ---
const HARDCODED_URL = 'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki?DateB=2024-11-20&DateE=2025-11-20';

// --- АВТОРИЗАЦИЯ ---
const ADMIN_AUTH_BASE64 = 'YWRtaW46anVlYmZueWU=';
const ADMIN_AUTH_HEADER = `Basic ${ADMIN_AUTH_BASE64}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const clientAuthHeader = req.headers.authorization;

    if (!clientAuthHeader || !clientAuthHeader.startsWith('Basic ')) {
        return res.status(401).json({ error: 'Authorization required' });
    }

    const clientAuthBase64 = clientAuthHeader.replace('Basic ', '').trim();

    try {
        const decoded = Buffer.from(clientAuthBase64, 'base64').toString();
        const [clientLogin] = decoded.split(":");

        console.log("HARDCODED PEREVOZKI FETCH", {
            login: clientLogin,
            url: HARDCODED_URL
        });

        const response = await axios.get(HARDCODED_URL, {
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
            return res.status(error.response.status).json(error.response.data || { error: 'External API Error' });
        }

        res.status(500).json({ error: 'Internal Server Error or Network Issue' });
    }
}

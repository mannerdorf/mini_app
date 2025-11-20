import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

// --- КОНФИГУРАЦИЯ ВНЕШНЕГО API (ЖЕСТКО ЗАДАННЫЙ URL) ---
const HARDCODED_EXTERNAL_URL =
  'https://tdn.postb.ru/workbase/hs/DeliveryWebService/GetPerevozki?DateB=2024-12-11&DateE=2026-01-01';

// --- СЛУЖЕБНЫЕ ДАННЫЕ (admin:juebfnye → base64) ---
const ADMIN_AUTH_HEADER = 'Basic YWRtaW46anVlYmZueWU=';

// --- КЛИЕНТСКИЕ ДАННЫЕ (НЕ закодированные, как в рабочем curl) ---
const CLIENT_AUTH_RAW_VALUE = 'Basic order@lal-auto.com:ZakaZ656565';

/**
 * Прокси-обработчик, повторяющий точный рабочий curl-запрос.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Authorization required' });
  }

  try {
    console.log('PEREVOZKI GET CALL - PURE REPLICA DEBUG', {
      TargetURL: HARDCODED_EXTERNAL_URL,
      AuthorizationHeader: ADMIN_AUTH_HEADER,
      AuthHeader: CLIENT_AUTH_RAW_VALUE,
      Message:
        'Используется точная копия рабочего CURL-запроса (включая незакодированный Auth-заголовок).',
    });

    const response = await axios.get(HARDCODED_EXTERNAL_URL, {
      headers: {
        Authorization: ADMIN_AUTH_HEADER,
        Auth: CLIENT_AUTH_RAW_VALUE,
      },
      timeout: 15000,
    });

    res.status(response.status).json(response.data);
  } catch (error: any) {
    console.error('External API Request Failed:', error.message);

    if (axios.isAxiosError(error) && error.response) {
      console.error('External API Response Status:', error.response.status);
      return res
        .status(error.response.status)
        .json(error.response.data || { error: 'External API Error' });
    }

    res
      .status(500)
      .json({ error: 'Internal Server Error or Network Issue' });
  }
}

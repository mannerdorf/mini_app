export const PROXY_API_BASE_URL = '/api/perevozki';
export const PROXY_API_GETCUSTOMERS_URL = '/api/getcustomers';
export const PROXY_API_DOWNLOAD_URL = '/api/download';
export const PROXY_API_SEND_DOC_URL = '/api/send-document';
export const PROXY_API_GETPEREVOZKA_URL = '/api/getperevozka';
export const PROXY_API_INVOICES_URL = '/api/invoices';
export const PROXY_API_ACTS_URL = '/api/acts';
export const PROXY_API_ORDERS_URL = '/api/orders';
export const PROXY_API_SENDINGS_URL = '/api/sendings';

/** URL вебхука для отправки заявок на расходы (P&L / БД). Если пустой — заявки сохраняются только в localStorage. */
export const EXPENSE_REQUESTS_WEBHOOK_URL = '';
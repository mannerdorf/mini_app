import handler from "./getfile (3)"; // Предполагаем, что файл getfile (3).ts находится в той же папке
import type { VercelRequest, VercelResponse } from "@vercel/node";

// --- МОКИРУЕМ Vercel Request и Response ---

/**
 * Мок-класс для имитации VercelResponse.
 * Захватывает статус, заголовки и отправляемые данные (Buffer).
 */
class MockResponse {
    private _status: number = 200;
    private _data: any = null;
    private _headers: Record<string, string> = {};

    status(statusCode: number): MockResponse {
        this._status = statusCode;
        return this;
    }

    json(data: any): MockResponse {
        this._data = data;
        return this as unknown as VercelResponse;
    }

    send(data: any): MockResponse {
        this._data = data;
        return this as unknown as VercelResponse;
    }

    setHeader(name: string, value: string): MockResponse {
        this._headers[name] = value;
        return this;
    }

    getSentStatus(): number {
        return this._status;
    }

    getSentData(): any {
        return this._data;
    }

    getHeaders(): Record<string, string> {
        return this._headers;
    }
}

/**
 * Вспомогательная функция для создания мока VercelRequest.
 */
const createMockRequest = (method: string, body: any): Partial<VercelRequest> => ({
    method,
    body,
});

// --- МОКИРУЕМ ГЛОБАЛЬНЫЙ FETCH ---

const originalFetch = global.fetch;
let mockFetch: jest.Mock;

/**
 * Устанавливает мок для глобального fetch.
 * @param {object} mockResponse - Объект, имитирующий ответ от upstream-сервиса.
 */
function setupFetchMock(mockResponse: { 
    ok: boolean, 
    status: number, 
    text?: () => Promise<string>, 
    arrayBuffer?: () => Promise<ArrayBuffer>,
    headers?: Record<string, string>
}) {
    // Вспомогательный класс для мокирования заголовков fetch-ответа
    class MockHeaders {
        private headers: Record<string, string>;
        constructor(h: Record<string, string>) { this.headers = h; }
        get(name: string): string | null { return this.headers[name.toLowerCase()] || null; }
    }

    mockFetch = jest.fn().mockResolvedValue({
        ok: mockResponse.ok,
        status: mockResponse.status,
        text: mockResponse.text || (() => Promise.resolve(mockResponse.ok ? "OK" : "Error from Upstream")),
        arrayBuffer: mockResponse.arrayBuffer || (() => Promise.resolve(new ArrayBuffer(0))),
        headers: new MockHeaders(mockResponse.headers || {}),
    });
    global.fetch = mockFetch as unknown as typeof fetch;
}

// Восстанавливаем оригинальный fetch после тестов
afterAll(() => {
    global.fetch = originalFetch;
});

// --- ТЕСТЫ ---

describe('Proxy Handler /api/download (GetFile)', () => {

    // Тест 1: Проверка метода (должен быть POST)
    test('1. Should return 405 for non-POST methods', async () => {
        const req = createMockRequest('GET', {});
        const res = new MockResponse();

        await handler(req as VercelRequest, res as unknown as VercelResponse);

        expect(res.getSentStatus()).toBe(405);
        expect(res.getHeaders()['Allow']).toBe("POST");
    });

    // Тест 2: Проверка обязательных параметров
    test('2. Should return 400 if login, password, metod, or Number is missing', async () => {
        const req = createMockRequest('POST', { login: 'u', password: 'p', Number: 'N' }); // Missing metod
        const res = new MockResponse();

        await handler(req as VercelRequest, res as unknown as VercelResponse);

        expect(res.getSentStatus()).toBe(400);
        expect(res.getSentData()).toEqual({ error: "login, password, metod, and Number are required" });
    });

    // Тест 3: Успешная загрузка файла и передача заголовков
    test('3. Should successfully proxy file data and set headers', async () => {
        const mockBinaryData = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]); // "Hello World"
        
        setupFetchMock({
            ok: true,
            status: 200,
            arrayBuffer: () => Promise.resolve(mockBinaryData.buffer),
            headers: {
                'content-type': 'application/pdf',
                'content-disposition': 'attachment; filename="test_doc.pdf"',
            },
        });

        const req = createMockRequest('POST', {
            login: 'test_user',
            password: 'test_password',
            metod: 'Schet',
            Number: 'TR-001'
        });
        const res = new MockResponse();

        await handler(req as VercelRequest, res as unknown as VercelResponse);

        // Проверяем, что fetch был вызван с правильными параметрами
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const fetchUrl = mockFetch.mock.calls[0][0];
        expect(fetchUrl).toContain('metod=Schet');
        expect(fetchUrl).toContain('Number=TR-001');

        // Проверяем статус и заголовки ответа
        expect(res.getSentStatus()).toBe(200);
        expect(res.getHeaders()['Content-Type']).toBe('application/pdf');
        expect(res.getHeaders()['Content-Disposition']).toBe('attachment; filename="test_doc.pdf"');
        
        // Проверяем, что res.send был вызван с Buffer'ом
        expect(res.getSentData()).toBeInstanceOf(Buffer);
        expect(res.getSentData().toString()).toBe('Hello World');
    });

    // Тест 4: Успешная загрузка файла с дефолтными заголовками
    test('4. Should use default headers if upstream headers are missing', async () => {
        const mockBinaryData = new Uint8Array([48, 49, 50]); // "012"
        
        setupFetchMock({
            ok: true,
            status: 200,
            arrayBuffer: () => Promise.resolve(mockBinaryData.buffer),
            headers: {}, // Пустые заголовки
        });

        const req = createMockRequest('POST', {
            login: 'user',
            password: 'pass',
            metod: 'Akt',
            Number: 'ABC-123'
        });
        const res = new MockResponse();

        await handler(req as VercelRequest, res as unknown as VercelResponse);

        // Проверяем, что прокси вернул статус 200
        expect(res.getSentStatus()).toBe(200);

        // Проверяем дефолтные заголовки
        expect(res.getHeaders()['Content-Type']).toBe('application/octet-stream');
        // Проверяем дефолтное имя файла
        expect(res.getHeaders()['Content-Disposition']).toBe('attachment; filename="ABC-123_Akt.pdf"');
        
        // Проверяем данные
        expect(res.getSentData()).toBeInstanceOf(Buffer);
    });


    // Тест 5: Ошибка upstream (например, 404 Not Found)
    test('5. Should proxy upstream error status and text (404 Not Found)', async () => {
        const upstreamErrorText = 'Document not found for this number';
        
        setupFetchMock({
            ok: false,
            status: 404,
            text: () => Promise.resolve(upstreamErrorText),
        });

        const req = createMockRequest('POST', {
            login: 'user',
            password: 'pass',
            metod: 'Akt',
            Number: 'NON-EXIST'
        });
        const res = new MockResponse();

        await handler(req as VercelRequest, res as unknown as VercelResponse);

        // Проверяем, что прокси вернул статус 404
        expect(res.getSentStatus()).toBe(404);
        // Проверяем, что прокси вернул тело ошибки от upstream
        expect(res.getSentData()).toBe(upstreamErrorText);
    });

    // Тест 6: Ошибка соединения или таймаут
    test('6. Should return 500 on network failure (fetch throws)', async () => {
        const networkError = new Error('Failed to fetch');
        
        mockFetch = jest.fn().mockRejectedValue(networkError);
        global.fetch = mockFetch as unknown as typeof fetch;

        const req = createMockRequest('POST', {
            login: 'user',
            password: 'pass',
            metod: 'Akt',
            Number: 'ABC-123'
        });
        const res = new MockResponse();

        await handler(req as VercelRequest, res as unknown as VercelResponse);

        // Проверяем, что прокси вернул 500
        expect(res.getSentStatus()).toBe(500);
        expect(res.getSentData()).toEqual({ error: 'Proxy fetch failed' });
    });
});

// Запускаем тесты (этот код не будет работать напрямую в песочнице,
// он предназначен для запуска с помощью Jest или аналогичного фреймворка)
console.log("Тесты готовы. Для выполнения используйте Jest или аналогичный тестовый фреймворк.");

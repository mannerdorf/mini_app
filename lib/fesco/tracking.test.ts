import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ get: vi.fn(), code: 200, body: '' }));
vi.mock('node:https', () => ({ default: { get: state.get } }));
import { requestFescoTracking } from './tracking';
beforeEach(() => { state.code = 200; state.body = JSON.stringify({ data: [{ containerNumber: 'AXIU1634881' }] }); state.get.mockImplementation((_url, _options, callback) => {
  const req = new EventEmitter() as any; req.destroy = () => req.emit('error', new Error('socket'));
  const res = new EventEmitter() as any; res.statusCode = state.code; res.setEncoding = () => {}; res.destroy = error => res.emit('error', error);
  queueMicrotask(() => { callback(res); res.emit('data', state.body); res.emit('end'); req.emit('close'); }); return req;
}); });
it('uses the fixed HTTPS endpoint and header authentication with Russian data', async () => {
  expect(await requestFescoTracking('AXIU1634881', 'secret')).toEqual([{ containerNumber: 'AXIU1634881' }]);
  expect(state.get.mock.calls[0][0]).toBe('https://api.fesco.com/api/v1/lk/tracking?numbers=AXIU1634881'); expect(state.get.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer secret', 'X-Lk-Lang': 'ru' });
});
it('does not expose upstream error bodies including secrets', async () => { state.code = 401; state.body = 'secret'; await expect(requestFescoTracking('AXIU1634881', 'secret')).rejects.toThrow('Проверьте токен API'); });
it('handles rate limits and malformed responses', async () => { state.code = 429; await expect(requestFescoTracking('AXIU1634881', 'secret')).rejects.toThrow('Лимит'); state.code = 200; state.body = '<html>'; await expect(requestFescoTracking('AXIU1634881', 'secret')).rejects.toThrow('неизвестном формате'); });

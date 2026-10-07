import React from 'react';
import { create, act } from 'react-test-renderer';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('../../../api/client/fesco', () => ({ fetchFescoTracking: vi.fn() }));
import { fetchFescoTracking } from '../../../api/client/fesco';
import { SendingTrackingDialog, extractContainerNumber, startedSegments } from './SendingTrackingDialog';
const fetchTracking = vi.mocked(fetchFescoTracking);
let root: ReturnType<typeof create>;
const auth = { login: 'user', password: 'pass' };
const ferry = { id: 1, name: 'FESCO NOVIK', provider: 'FESCO' };
beforeEach(() => { fetchTracking.mockReset(); vi.stubGlobal('document', { activeElement: null }); });
afterEach(() => { act(() => root?.unmount()); vi.unstubAllGlobals(); });
async function mount(initialNumber = 'AXIU1634881') { await act(async () => { root = create(React.createElement(SendingTrackingDialog, { auth, ferry, initialNumber, onClose() {} }), { createNodeMock: el => el.type === 'dialog' ? { showModal() {}, close() {} } : null }); }); }
it('extracts a container while avoiding ordinary vehicle numbers', () => { expect(extractContainerNumber('AXIU 1634881')).toBe('AXIU1634881'); expect(extractContainerNumber('P947XE39')).toBe(''); });
it('loads shipment container and distinguishes current route from latest factual operation', async () => {
  fetchTracking.mockResolvedValue({ ok: true, data: [{ containerNumber: 'AXIU1634881', order: { bills: ['KLSP26NVK320044'] }, segments: [{ id: 'sea', currentSegment: true, inProgress: true, segmentType: 'SEA', departureLocation: 'Калининград', destinationLocation: 'Санкт-Петербург', transport: { name: 'ФЕСКО НОВИК', voyageNumber: '26NVK32' } }], events: { lastEventId: 'received', data: [{ id: 'received', date: '2026-09-30 06:00:00', operation: 'Arrived Full from Shipper', location: 'КМТП' }] } }] });
  await mount(); expect(fetchTracking).toHaveBeenCalledWith(auth, 1, 'AXIU1634881'); const text = JSON.stringify(root.toJSON()); for (const value of ['KLSP26NVK320044', '26NVK32', 'Сейчас', 'Последняя операция', 'Гружёный контейнер принят от отправителя']) expect(text).toContain(value);
});
it('shows missing container without an input or request', async () => {
  await mount(''); expect(fetchTracking).not.toHaveBeenCalled();
  expect(root.root.findAllByType('input')).toHaveLength(0);
  expect(root.root.findAllByType('form')).toHaveLength(0);
  expect(root.root.findByProps({ role: 'alert' }).children.join('')).toContain('не указан номер контейнера');
});
it('retries automatic tracking from the header', async () => {
  fetchTracking.mockRejectedValueOnce(new Error('offline'));
  await mount(); expect(root.root.findAllByProps({ role: 'alert' })).toHaveLength(1);
  fetchTracking.mockResolvedValue({ ok: true, data: [] });
  await act(async () => root.root.findByProps({ 'aria-label': 'Обновить трекинг' }).props.onClick()); expect(fetchTracking).toHaveBeenCalledTimes(2);
});

it('hides future stages even when marked current, while keeping factual departures', () => {
  const segments = [
    { id: 'complete', completed: true },
    { id: 'active', inProgress: true },
    { id: 'departed', departureDate: '2026-10-05' },
    { id: 'future', plan: true, currentSegment: true, planingDepartureDate: '2026-10-09' },
  ];
  expect(startedSegments(segments).map(segment => segment.id)).toEqual(['complete', 'active', 'departed']);
});
it('omits future routes and planning events, and keeps unknown factual operations', async () => {
  fetchTracking.mockResolvedValue({ ok: true, data: [{ containerNumber: 'AXIU1634881', segments: [
    { id: 'complete', completed: true, departureLocation: 'Калининград', destinationLocation: 'Калининград' },
    { id: 'future', plan: true, departureLocation: 'Будущий город', destinationLocation: 'Будущий терминал' },
  ], events: { data: [
    { id: 'planned', type: 'planning', operation: 'Планирование будущего этапа' },
    { id: 'fact', type: 'softship', operation: 'Carrier custom operation', date: '2026-10-05' },
  ] } }] });
  await mount();
  const text = JSON.stringify(root.toJSON());
  expect(text).not.toContain('Будущий город');
  expect(text).not.toContain('Планирование будущего этапа');
  expect(text).toContain('Калининград');
  expect(text).toContain('Carrier custom operation');
  expect(text).not.toContain('Груз доставлен');
});

import React from 'react';
import { create, act } from 'react-test-renderer';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('../../../api/client/fesco', () => ({ fetchFescoTracking: vi.fn() }));
import { fetchFescoTracking } from '../../../api/client/fesco';
import { SendingTrackingDialog, extractContainerNumber } from './SendingTrackingDialog';
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
  await mount(); expect(fetchTracking).toHaveBeenCalledWith(auth, 1, 'AXIU1634881'); const text = JSON.stringify(root.toJSON()); for (const value of ['KLSP26NVK320044', '26NVK32', 'Текущий участок', 'Груз здесь', 'Arrived Full from Shipper']) expect(text).toContain(value);
});
it('allows a manual number when sending has no container and retries failures', async () => {
  await mount(''); expect(fetchTracking).not.toHaveBeenCalled();
  act(() => root.root.findByType('input').props.onChange({ target: { value: 'KLSP26NVK320044' } }));
  fetchTracking.mockRejectedValueOnce(new Error('offline'));
  await act(async () => root.root.findByType('form').props.onSubmit({ preventDefault() {} })); expect(root.root.findAllByProps({ role: 'alert' })).toHaveLength(1);
  fetchTracking.mockResolvedValue({ ok: true, data: [] });
  await act(async () => root.root.findByProps({ 'aria-label': 'Обновить трекинг' }).props.onClick()); expect(fetchTracking).toHaveBeenCalledTimes(2);
});

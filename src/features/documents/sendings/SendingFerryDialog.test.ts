import React from 'react';
import { create, act } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../../api/client/ais', () => ({ fetchMarinesiaShip: vi.fn() }));
vi.mock('@maxhub/max-ui', () => ({ Panel: 'section', Flex: 'div', Typography: { Body: 'p' } }));
import { fetchMarinesiaShip } from '../../../api/client/ais';
import { SendingFerryDialog } from './SendingFerryDialog';
const fetchShip = vi.mocked(fetchMarinesiaShip);
const ferry = { mmsi: '273251360', name: 'ALISA' };
const vessel = { ...ferry, lat: 54.6, lon: 19.9, cog: 85, hdt: 86, dest: 'RUBLI', eta: '2026-10-08 10:00', status: 5, draught: 6.4, timeUtc: '2026-10-07T12:00:00Z' };
let root: ReturnType<typeof create>;
beforeEach(() => {
  fetchShip.mockReset();
  vi.stubGlobal('document', { activeElement: null });
});
afterEach(() => { act(() => root?.unmount()); vi.unstubAllGlobals(); });
async function mount() {
  const close = vi.fn();
  await act(async () => { root = create(React.createElement(SendingFerryDialog, { ferry, onClose: close }), { createNodeMock: el => el.type === 'dialog' ? { showModal() {}, close() {} } : null }); });
  return close;
}
it('loads the selected ferry in a modal, showing map and independent course fields', async () => {
  fetchShip.mockResolvedValue({ ok: true, vessel });
  const close = await mount();
  expect(fetchShip).toHaveBeenCalledWith(ferry.mmsi);
  expect(root.root.findByType('dialog').props['aria-label']).toContain('ALISA');
  expect(root.root.findByType('iframe').props.src).toContain('54.6,19.9');
  const text = JSON.stringify(root.toJSON());
  expect(text).toContain('Курс относительно земли:');
  expect(text).toContain('Истинный курс (нос судна):');
  expect(text).toContain('Балтийск (RUBLI)');
  expect(text).toContain('Последнее обновление (UTC):');
  act(() => root.root.findByProps({ 'aria-label': 'Закрыть карту парома' }).props.onClick());
  expect(close).toHaveBeenCalledOnce();
});
it('shows provider errors and permits retry', async () => {
  fetchShip.mockResolvedValueOnce({ ok: false, error: 'Превышен лимит' }).mockResolvedValueOnce({ ok: true, vessel });
  await mount();
  expect(root.root.findByProps({ role: 'alert' }).children.join('')).toContain('Превышен лимит');
  expect(root.root.findAllByType('iframe')).toHaveLength(0);
  await act(async () => root.root.findByProps({ 'aria-label': 'Обновить положение судна' }).props.onClick());
  expect(fetchShip).toHaveBeenCalledTimes(2);
  expect(root.root.findAllByProps({ role: 'alert' })).toHaveLength(0);
  expect(root.root.findAllByType('iframe')).toHaveLength(1);
});
it('handles an empty vessel response', async () => {
  fetchShip.mockResolvedValue({ ok: true });
  await mount();
  expect(root.root.findByProps({ role: 'alert' }).children.join('')).toContain('Судно не найдено');
});

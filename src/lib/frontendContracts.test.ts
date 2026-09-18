import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildCargoItemFromGetPerevozkaResponse } from './parseGetPerevozkaResponse';
import { getPaymentFilterKey, getFilterKeyByStatus, isReceivedInfoStatus } from './statusUtils';
import { DocumentsSummaryCard } from '../features/documents/views/documentsSharedViewBlocks';

describe('frontend API boundaries', () => {
  it.each([null, undefined, 42, {}, ['paid']])('does not crash on a non-string upstream status: %j', value => {
    expect(getPaymentFilterKey(value)).toBe('unknown');
    expect(() => getFilterKeyByStatus(value)).not.toThrow();
    expect(isReceivedInfoStatus(value)).toBe(false);
  });
  it('preserves zero and numeric strings, rejects structured metrics', () => {
    const item = buildCargoItemFromGetPerevozkaResponse({ Number: '00123', DatePrih: '2026-09-19', Mest: 0, PW: '12.5', W: {}, Sum: 0, Sender: {} }, '00123');
    expect(item).toMatchObject({ Number: '00123', Mest: 0, PW: '12.5', Sum: 0 });
    expect(item?.W).toBeUndefined();
    expect(item?.Sender).toBeUndefined();
  });
  it('renders the documents totals after extraction into a shared component', () => {
    const html = renderToStaticMarkup(React.createElement(DocumentsSummaryCard, {
      summary: { sum: 100, count: 2, mest: 3, pw: 15, w: 12, vol: 1 },
      showSums: true, useServiceRequest: true, expandedMetrics: true,
    }));
    expect(html).toContain('Плат. вес');
    expect(html).not.toContain('NaN');
  });
});

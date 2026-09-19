import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { StatusBadge, StatusBillBadge } from './StatusBadges';
it.each(['Частично оплачен', 'Частично оплачён', 'Partially paid'])(
  'does not show partial payment as full payment: %s', status => {
    const html = renderToStaticMarkup(React.createElement(StatusBillBadge, { status }));
    expect(html).toContain('max-badge-warning');
    expect(html).not.toContain('max-badge-success');
  },
);
it.each([['Оплачен','success'], ['Не оплачен','danger'], ['Отменён','danger'], ['','default']])(
  'preserves other payment states: %s', (status, color) => {
    expect(renderToStaticMarkup(React.createElement(StatusBillBadge, { status }))).toContain(`max-badge-${color}`);
  },
);

// Transit is informational; cancellation is neutral, not an actionable error.
it.each([['В пути', 'info'], ['Отменён', 'default'], ['Доставлен', 'success']])(
  'uses the semantic shipment palette: %s', (status, tone) => {
    expect(renderToStaticMarkup(React.createElement(StatusBadge, { status }))).toContain(`max-badge-${tone}`);
  },
);

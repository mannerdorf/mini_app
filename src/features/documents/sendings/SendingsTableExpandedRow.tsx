import React from "react";
import { Button } from "@maxhub/max-ui";
import { Typography } from "@maxhub/max-ui";
import { SendingsTableExpandedGeneralView } from "./SendingsTableExpandedGeneralView";
import { SendingsTableExpandedByCargoView } from "./SendingsTableExpandedByCargoView";
import { SendingsTableExpandedByCustomerView } from "./SendingsTableExpandedByCustomerView";
import type { SendingsTableExpandedRowProps } from "./sendingsTableExpandedProps";

export function SendingsTableExpandedRow(props: SendingsTableExpandedRowProps) {
  const {
    sendingsDetailsView,
    setSendingsDetailsView,
    sendingsSummaryGroupBy,
    setSendingsSummaryGroupBy,
    setSendingsSummarySortColumn,
    setSendingsSummarySortOrder,
    parcelsToRender,
    sendingsAnalyticsExtraColCount,
    canSelectSendingRows,
  } = props;

  return (
    <tr>
      <td colSpan={9 + sendingsAnalyticsExtraColCount + (canSelectSendingRows ? 1 : 0)} style={{ padding: 0, borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
        <div style={{ padding: '0.5rem', overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Button
                  className="filter-button"
                  style={{ padding: '0.35rem 0.6rem', minWidth: 'auto', background: sendingsDetailsView === 'general' ? 'var(--color-primary-blue, #2563eb)' : undefined, color: sendingsDetailsView === 'general' ? '#fff' : undefined }}
                  onClick={(e) => { e.stopPropagation(); setSendingsDetailsView('general'); }}
              >
                  Общий
              </Button>
              <Button
                  className="filter-button"
                  style={{ padding: '0.35rem 0.6rem', minWidth: 'auto', background: sendingsDetailsView === 'byCargo' ? 'var(--color-primary-blue, #2563eb)' : undefined, color: sendingsDetailsView === 'byCargo' ? '#fff' : undefined }}
                  onClick={(e) => { e.stopPropagation(); setSendingsDetailsView('byCargo'); }}
              >
                  По перевозкам
              </Button>
              <Button
                  className="filter-button"
                  style={{ padding: '0.35rem 0.6rem', minWidth: 'auto', background: sendingsDetailsView === 'byCustomer' && sendingsSummaryGroupBy === 'customer' ? 'var(--color-primary-blue, #2563eb)' : undefined, color: sendingsDetailsView === 'byCustomer' && sendingsSummaryGroupBy === 'customer' ? '#fff' : undefined }}
                  onClick={(e) => {
                      e.stopPropagation();
                      setSendingsDetailsView('byCustomer');
                      setSendingsSummaryGroupBy('customer');
                      setSendingsSummarySortColumn('customer');
                      setSendingsSummarySortOrder('asc');
                  }}
              >
                  По заказчику
              </Button>
              <Button
                  className="filter-button"
                  style={{ padding: '0.35rem 0.6rem', minWidth: 'auto', background: sendingsDetailsView === 'byCustomer' && sendingsSummaryGroupBy === 'receiver' ? 'var(--color-primary-blue, #2563eb)' : undefined, color: sendingsDetailsView === 'byCustomer' && sendingsSummaryGroupBy === 'receiver' ? '#fff' : undefined }}
                  onClick={(e) => {
                      e.stopPropagation();
                      setSendingsDetailsView('byCustomer');
                      setSendingsSummaryGroupBy('receiver');
                      setSendingsSummarySortColumn('customer');
                      setSendingsSummarySortOrder('asc');
                  }}
              >
                  По получателю
              </Button>
          </div>
          {parcelsToRender.length === 0 ? (
            <Typography.Body style={{ color: 'var(--color-text-secondary)', padding: '0.5rem 0.25rem' }}>Нет данных по посылкам</Typography.Body>
          ) : sendingsDetailsView === 'general' ? (
            <SendingsTableExpandedGeneralView {...props} />
          ) : sendingsDetailsView === 'byCargo' ? (
            <SendingsTableExpandedByCargoView {...props} />
          ) : (
            <SendingsTableExpandedByCustomerView {...props} />
          )}
        </div>
      </td>
    </tr>
  );
}

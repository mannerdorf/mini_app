import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import * as dateUtils from "../../../lib/dateUtils";
import { fetchAdminInvoices } from "../../../api/client/admin/invoices";
import { fetchAdminPerevozki } from "../../../api/client/admin/perevozki";
import {
  buildDeliveredWithoutAppReport,
  expandInvoiceLookupDateFrom,
} from "../../../lib/adminDeliveredWithoutAppAnalytics";
import type { CargoItem } from "../../../types";

const MONTH_NAMES = dateUtils.MONTH_NAMES;

export function AdminDeliveredWithoutAppSection({ adminToken }: { adminToken: string }) {
  const [period, setPeriod] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });

  const dateRange = useMemo(() => {
    const { year, month } = period;
    const lastDay = new Date(year, month, 0).getDate();
    return {
      dateFrom: `${year}-${String(month).padStart(2, "0")}-01`,
      dateTo: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    };
  }, [period.month, period.year]);

  const invoiceLookupRange = useMemo(
    () => ({
      dateFrom: expandInvoiceLookupDateFrom(dateRange.dateFrom),
      dateTo: dateRange.dateTo,
    }),
    [dateRange.dateFrom, dateRange.dateTo],
  );

  const yearOptions = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const years = new Set<number>([nowYear - 2, nowYear - 1, nowYear, nowYear + 1, period.year]);
    return Array.from(years).sort((a, b) => b - a);
  }, [period.year]);

  const [cargoItems, setCargoItems] = useState<CargoItem[]>([]);
  const [invoices, setInvoices] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!adminToken) return { cargo: [] as CargoItem[], invoices: [] as unknown[] };
    const [cargo, inv] = await Promise.all([
      fetchAdminPerevozki(adminToken, dateRange, { dateField: "vr" }),
      fetchAdminInvoices(adminToken, invoiceLookupRange),
    ]);
    return { cargo, invoices: inv };
  }, [adminToken, dateRange, invoiceLookupRange]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadData()
      .then(({ cargo, invoices: inv }) => {
        if (!cancelled) {
          setCargoItems(cargo);
          setInvoices(inv);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError((e as Error)?.message || "Ошибка загрузки");
          setCargoItems([]);
          setInvoices([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const report = useMemo(
    () => buildDeliveredWithoutAppReport(cargoItems, invoices),
    [cargoItems, invoices],
  );

  return (
    <div>
      <Typography.Body style={{ fontSize: "0.88rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Перевозки со статусом «Доставлено» за период по дате выдачи (<code>DateVr</code>), у которых нет АПП в ЭДО
        (пустое поле <code>DDRecipientResponseStatus_APP</code> на связанном счёте или перевозке).
      </Typography.Body>

      <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
        <select
          className="admin-form-input"
          value={period.month}
          onChange={(e) => {
            const month = Number(e.target.value);
            if (!Number.isFinite(month) || month < 1 || month > 12) return;
            setPeriod((prev) => ({ ...prev, month }));
          }}
          style={{ padding: "0 0.5rem", minWidth: "10rem" }}
          aria-label="Месяц"
        >
          {MONTH_NAMES.map((name, idx) => (
            <option key={`delivered-no-app-month-${idx + 1}`} value={idx + 1}>
              {name.charAt(0).toUpperCase() + name.slice(1)}
            </option>
          ))}
        </select>
        <select
          className="admin-form-input"
          value={period.year}
          onChange={(e) => {
            const year = Number(e.target.value);
            if (!Number.isFinite(year)) return;
            setPeriod((prev) => ({ ...prev, year }));
          }}
          style={{ padding: "0 0.5rem", minWidth: "6.5rem" }}
          aria-label="Год"
        >
          {yearOptions.map((year) => (
            <option key={`delivered-no-app-year-${year}`} value={year}>
              {year}
            </option>
          ))}
        </select>
      </Flex>

      <Typography.Label style={{ display: "block", marginBottom: "0.75rem", color: "var(--color-text-secondary)", fontSize: "0.78rem" }}>
        Выдача: {dateRange.dateFrom} — {dateRange.dateTo}. Счета для связи: {invoiceLookupRange.dateFrom} — {invoiceLookupRange.dateTo}.
      </Typography.Label>

      {loading && (
        <Flex align="center" gap="0.5rem" style={{ padding: "1.5rem 0", color: "var(--color-text-secondary)" }}>
          <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
          Загрузка перевозок и счетов…
        </Flex>
      )}

      {error && !loading && (
        <Typography.Body style={{ color: "var(--color-danger, #dc2626)", marginBottom: "1rem" }}>{error}</Typography.Body>
      )}

      {!loading && !error && (
        <>
          <Flex gap="0.75rem" wrap="wrap" style={{ marginBottom: "1rem" }}>
            <Panel className="cargo-card" style={{ padding: "0.75rem 1rem", borderRadius: 12, minWidth: 140 }}>
              <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>Доставлено</Typography.Body>
              <Typography.Headline style={{ fontSize: "1.35rem", fontWeight: 700 }}>{report.deliveredTotal}</Typography.Headline>
            </Panel>
            <Panel className="cargo-card" style={{ padding: "0.75rem 1rem", borderRadius: 12, minWidth: 140 }}>
              <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>Без АПП</Typography.Body>
              <Typography.Headline style={{ fontSize: "1.35rem", fontWeight: 700, color: "#dc2626" }}>
                {report.withoutApp}
              </Typography.Headline>
            </Panel>
            <Panel className="cargo-card" style={{ padding: "0.75rem 1rem", borderRadius: 12, minWidth: 140 }}>
              <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>С АПП</Typography.Body>
              <Typography.Headline style={{ fontSize: "1.35rem", fontWeight: 700, color: "var(--color-success-status)" }}>
                {report.withApp}
              </Typography.Headline>
            </Panel>
            {report.noLinkedInvoice > 0 ? (
              <Panel className="cargo-card" style={{ padding: "0.75rem 1rem", borderRadius: 12, minWidth: 140 }}>
                <Typography.Body style={{ fontSize: "0.72rem", color: "var(--color-text-secondary)" }}>Без счёта</Typography.Body>
                <Typography.Headline style={{ fontSize: "1.35rem", fontWeight: 700 }}>{report.noLinkedInvoice}</Typography.Headline>
              </Panel>
            ) : null}
          </Flex>

          <Panel className="cargo-card" style={{ padding: "1rem 1.1rem", borderRadius: 12, background: "var(--color-bg-card)" }}>
            {report.rows.length === 0 ? (
              <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
                За выбранный период нет доставленных перевозок без АПП.
              </Typography.Body>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
                      <th style={{ padding: "0.45rem 0.5rem", textAlign: "left", fontWeight: 600 }}>№ перевозки</th>
                      <th style={{ padding: "0.45rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Заказчик</th>
                      <th style={{ padding: "0.45rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Приход</th>
                      <th style={{ padding: "0.45rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Выдача</th>
                      <th style={{ padding: "0.45rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Маршрут</th>
                      <th style={{ padding: "0.45rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Счёт</th>
                      <th style={{ padding: "0.45rem 0.5rem", textAlign: "left", fontWeight: 600 }}>Статус АПП</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr key={row.cargoNumber} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "0.45rem 0.5rem", fontWeight: 600, whiteSpace: "nowrap" }}>{row.cargoNumber}</td>
                        <td
                          style={{
                            padding: "0.45rem 0.5rem",
                            maxWidth: 220,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={row.customer}
                        >
                          {row.customer}
                        </td>
                        <td style={{ padding: "0.45rem 0.5rem", whiteSpace: "nowrap" }}>
                          {row.datePrih ? <DateText value={row.datePrih} /> : "—"}
                        </td>
                        <td style={{ padding: "0.45rem 0.5rem", whiteSpace: "nowrap" }}>
                          {row.dateVr ? <DateText value={row.dateVr} /> : "—"}
                        </td>
                        <td style={{ padding: "0.45rem 0.5rem", whiteSpace: "nowrap" }}>{row.route}</td>
                        <td style={{ padding: "0.45rem 0.5rem", whiteSpace: "nowrap" }}>{row.invoiceNumber ?? "—"}</td>
                        <td style={{ padding: "0.45rem 0.5rem", whiteSpace: "nowrap", color: "var(--color-text-secondary)" }}>
                          {row.appStatusLabel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Flex, Panel, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { DateText } from "../../../components/ui/DateText";
import * as dateUtils from "../../../lib/dateUtils";
import { fetchAdminInvoices } from "../../../api/client/admin/invoices";
import { fetchAdminPerevozki } from "../../../api/client/admin/perevozki";
import { fetchHaulzInvoices, fetchHaulzPerevozki } from "../../../api/client/haulzAnalytics";
import type { AuthData } from "../../../types";
import {
  buildDeliveredWithoutAppReport,
  expandInvoiceLookupDateFrom,
  filterSortDeliveredAppRows,
  type DeliveredAppFilter,
  type DeliveredAppSortColumn,
} from "../../../lib/adminDeliveredWithoutAppAnalytics";
import type { CargoItem } from "../../../types";

const MONTH_NAMES = dateUtils.MONTH_NAMES;

export function AdminDeliveredWithoutAppSection({
  adminToken,
  auth,
  useServiceRequest = false,
}: {
  adminToken?: string;
  auth?: AuthData;
  useServiceRequest?: boolean;
}) {
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
    if (adminToken) {
      const [cargo, inv] = await Promise.all([
        fetchAdminPerevozki(adminToken, dateRange, { dateField: "vr" }),
        fetchAdminInvoices(adminToken, invoiceLookupRange),
      ]);
      return { cargo, invoices: inv };
    }
    if (!auth?.login || !auth?.password) {
      return { cargo: [] as CargoItem[], invoices: [] as unknown[] };
    }
    const [cargo, inv] = await Promise.all([
      fetchHaulzPerevozki(auth, dateRange, useServiceRequest, { dateField: "vr" }),
      fetchHaulzInvoices(auth, invoiceLookupRange, useServiceRequest),
    ]);
    return { cargo, invoices: inv };
  }, [adminToken, auth, useServiceRequest, dateRange, invoiceLookupRange]);

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

  const [filter,setFilter] = useState<DeliveredAppFilter>('withoutApp');
  const [sort,setSort] = useState<{column:DeliveredAppSortColumn;order:'asc'|'desc'}>({column:'dateVr',order:'desc'});
  const report = useMemo(
    () => buildDeliveredWithoutAppReport(cargoItems, invoices),
    [cargoItems, invoices],
  );

  const visibleRows=useMemo(()=>filterSortDeliveredAppRows(report.allRows,filter,sort.column,sort.order),[report,filter,sort]);
  const metrics: {key:DeliveredAppFilter;label:string;value:number;color?:string}[] = [
    {key:'all',label:'Доставлено',value:report.deliveredTotal},
    {key:'withoutApp',label:'Без АПП',value:report.withoutApp,color:'#dc2626'},
    {key:'withApp',label:'С АПП',value:report.withApp,color:'var(--color-success-status)'},
    {key:'withoutInvoice',label:'Без счёта',value:report.noLinkedInvoice},
  ];
  const columns:{key:DeliveredAppSortColumn;label:string}[]=[
    {key:'cargoNumber',label:'№ перевозки'},{key:'customer',label:'Заказчик'},
    {key:'datePrih',label:'Приход'},{key:'dateVr',label:'Выдача'},
    {key:'route',label:'Маршрут'},{key:'invoiceNumber',label:'Счёт'},{key:'appStatusLabel',label:'Статус АПП'},
  ];
  return (
    <div>
      <Typography.Body style={{ fontSize: "0.88rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Доставленные перевозки за период по дате выдачи. Нажмите на карточку, чтобы отфильтровать список по наличию АПП или счёта.
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
            {metrics.map(metric=><button key={metric.key} type="button" className="cargo-card" aria-pressed={filter===metric.key}
              onClick={()=>setFilter(current=>current===metric.key?'all':metric.key)}
              style={{padding:'0.75rem 1rem',borderRadius:12,minWidth:140,textAlign:'left',cursor:'pointer',font:'inherit',color:'var(--color-text-primary)',background:'var(--color-bg-card)',border:filter===metric.key?'2px solid var(--color-primary-blue,#2563eb)':'2px solid var(--color-border)'}}>
              <span style={{display:'block',fontSize:'0.72rem',color:'var(--color-text-secondary)'}}>{metric.label}</span>
              <strong style={{display:'block',fontSize:'1.35rem',fontWeight:700,color:metric.color}}>{metric.value}</strong>
            </button>)}
          </Flex>

          <Panel className="cargo-card" style={{ padding: "1rem 1.1rem", borderRadius: 12, background: "var(--color-bg-card)" }}>
            {visibleRows.length === 0 ? (
              <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
                Нет перевозок по выбранному фильтру за этот период.
              </Typography.Body>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
                      {columns.map(column=><th key={column.key} aria-sort={sort.column===column.key?(sort.order==='asc'?'ascending':'descending'):'none'} style={{padding:'0.45rem 0.5rem',textAlign:'left',fontWeight:600}}>
                        <button type="button" onClick={()=>setSort(current=>({column:column.key,order:current.column===column.key?(current.order==='asc'?'desc':'asc'):(column.key==='datePrih'||column.key==='dateVr'?'desc':'asc')}))}
                          style={{border:0,padding:0,background:'transparent',font:'inherit',color:'inherit',cursor:'pointer',textAlign:'left'}}>
                          {column.label} {sort.column===column.key?(sort.order==='asc'?'↑':'↓'):'↕'}
                        </button>
                      </th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
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

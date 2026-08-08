import React from "react";

export type PendingFivepostRow = {
  lineNo: number;
  clientOrderNo: string;
  partnerOrderNo: string;
  teBarcode: string;
  placesCount: number;
  omniBarcode: string;
  itemName: string;
  itemNameRu: string;
  unitCost: number | null;
  totalCost: number | null;
  weightG: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
};

export type PendingLegacyTableRow = {
  n?: number;
  posylka?: string;
  otskanirvano?: boolean;
  dataSkanirovaniya?: string;
  perevozka?: string;
};

type Props = {
  fivepostRows?: PendingFivepostRow[];
  legacyRows?: PendingLegacyTableRow[];
};

export function DocumentsOrdersPendingCargo({ fivepostRows, legacyRows }: Props) {
  if (fivepostRows?.length) {
    return (
      <div style={{ overflowX: "auto", maxHeight: "55vh", overflowY: "auto" }}>
        <p style={{ fontSize: "0.8rem", fontWeight: 600, margin: "0 0 0.35rem", color: "var(--color-text-secondary)" }}>
          5 POST ({fivepostRows.length} строк)
        </p>
        <table className="doc-inner-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
              <th style={{ padding: "0.35rem 0.3rem", textAlign: "left" }}>#</th>
              <th style={{ padding: "0.35rem 0.3rem", textAlign: "left" }}>Заказ клиента</th>
              <th style={{ padding: "0.35rem 0.3rem", textAlign: "left" }}>Заказ партнёра</th>
              <th style={{ padding: "0.35rem 0.3rem", textAlign: "left" }}>ШК ТЕ</th>
              <th style={{ padding: "0.35rem 0.3rem", textAlign: "right" }}>Мест</th>
              <th style={{ padding: "0.35rem 0.3rem", textAlign: "left" }}>ШК OMNI</th>
              <th style={{ padding: "0.35rem 0.3rem", textAlign: "left" }}>Наименование</th>
              <th style={{ padding: "0.35rem 0.3rem", textAlign: "left" }}>RU</th>
              <th style={{ padding: "0.35rem 0.3rem", textAlign: "right" }}>Цена</th>
              <th style={{ padding: "0.35rem 0.3rem", textAlign: "right" }}>Сумма</th>
              <th style={{ padding: "0.35rem 0.3rem", textAlign: "right" }}>Вес</th>
              <th style={{ padding: "0.35rem 0.3rem", textAlign: "left" }}>Д×Ш×В</th>
            </tr>
          </thead>
          <tbody>
            {fivepostRows.map((r) => (
              <tr key={r.lineNo} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "0.35rem 0.3rem" }}>{r.lineNo}</td>
                <td style={{ padding: "0.35rem 0.3rem" }}>{r.clientOrderNo || "—"}</td>
                <td style={{ padding: "0.35rem 0.3rem" }}>{r.partnerOrderNo || "—"}</td>
                <td style={{ padding: "0.35rem 0.3rem", whiteSpace: "nowrap" }}>{r.teBarcode || "—"}</td>
                <td style={{ padding: "0.35rem 0.3rem", textAlign: "right" }}>{r.placesCount ?? "—"}</td>
                <td style={{ padding: "0.35rem 0.3rem", whiteSpace: "nowrap" }}>{r.omniBarcode || "—"}</td>
                <td style={{ padding: "0.35rem 0.3rem" }}>{r.itemName || "—"}</td>
                <td style={{ padding: "0.35rem 0.3rem" }}>{r.itemNameRu || "—"}</td>
                <td style={{ padding: "0.35rem 0.3rem", textAlign: "right" }}>{r.unitCost ?? "—"}</td>
                <td style={{ padding: "0.35rem 0.3rem", textAlign: "right" }}>{r.totalCost ?? "—"}</td>
                <td style={{ padding: "0.35rem 0.3rem", textAlign: "right" }}>{r.weightG ?? "—"}</td>
                <td style={{ padding: "0.35rem 0.3rem", whiteSpace: "nowrap" }}>
                  {[r.lengthMm, r.widthMm, r.heightMm].map((v) => v ?? "—").join("×")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (legacyRows?.length) {
    return (
      <div style={{ overflowX: "auto" }}>
        <p style={{ fontSize: "0.8rem", fontWeight: 600, margin: "0 0 0.35rem", color: "var(--color-text-secondary)" }}>
          Табличная часть ({legacyRows.length} мест)
        </p>
        <table className="doc-inner-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-hover)" }}>
              <th style={{ padding: "0.35rem 0.3rem", textAlign: "left" }}>N</th>
              <th style={{ padding: "0.35rem 0.3rem", textAlign: "left" }}>Посылка</th>
              <th style={{ padding: "0.35rem 0.3rem", textAlign: "left" }}>Перевозка</th>
            </tr>
          </thead>
          <tbody>
            {legacyRows.map((row, idx) => (
              <tr key={row.n ?? idx} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "0.35rem 0.3rem" }}>{row.n ?? idx + 1}</td>
                <td style={{ padding: "0.35rem 0.3rem" }}>{row.posylka || "—"}</td>
                <td style={{ padding: "0.35rem 0.3rem" }}>{row.perevozka || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}

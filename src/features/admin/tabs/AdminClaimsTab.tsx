import React from "react";
import { Button, Flex, Panel, Typography, Input } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import {
  CLAIMS_FILTER_CONTROL_HEIGHT,
  CLAIM_STATUS_LABELS_RU,
} from "../lib/claimConstants";
import type { useAdminEmployeeDirectory } from "../hooks/useAdminEmployeeDirectory";
import { useAdminClaims } from "../hooks/useAdminClaims";
import { AdminClaimDetailPanel } from "../components/AdminClaimDetailPanel";

type EmployeeDir = ReturnType<typeof useAdminEmployeeDirectory>;

export type AdminClaimsTabProps = {
  adminToken: string;
  isSuperAdmin: boolean;
  onError: (msg: string | null) => void;
  employeeDir: EmployeeDir;
  variant?: "accounting" | "standalone";
};

export function AdminClaimsTab({
  adminToken,
  isSuperAdmin,
  onError,
  employeeDir,
  variant = "accounting",
}: AdminClaimsTabProps) {
  const claims = useAdminClaims({ adminToken, isSuperAdmin, onError, employeeDir });
  const {
    adminClaims,
    adminClaimsLoading,
    adminClaimsStatusFilter,
    setAdminClaimsStatusFilter,
    adminClaimsSearch,
    setAdminClaimsSearch,
    adminClaimsUpdatingId,
    adminClaimsView,
    setAdminClaimsView,
    adminClaimsKpi,
    adminClaimsChart,
    setAdminClaimDetailId,
    reloadAdminClaims,
    updateAdminClaimStatus,
    deleteAdminClaim,
  } = claims;

  return (
    <>
<Panel className="cargo-card" style={{ padding: "var(--pad-card, 1rem)", marginTop: variant === "accounting" ? "1rem" : undefined }}>
  <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
    {variant === "accounting" ? "Претензии (финансовый контур)" : "Претензии (менеджер / руководитель)"}
  </Typography.Body>
  <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
    <Button
      type="button"
      className="filter-button"
      style={{
        background: adminClaimsView === "new" ? "var(--color-primary-blue)" : undefined,
        color: adminClaimsView === "new" ? "white" : undefined,
        height: CLAIMS_FILTER_CONTROL_HEIGHT,
        minWidth: 68,
        padding: "0 0.7rem",
      }}
      onClick={() => { setAdminClaimsView("new"); setAdminClaimsStatusFilter(""); }}
    >
      Новые
    </Button>
    <Button
      type="button"
      className="filter-button"
      style={{
        background: adminClaimsView === "in_progress" ? "var(--color-primary-blue)" : undefined,
        color: adminClaimsView === "in_progress" ? "white" : undefined,
        height: CLAIMS_FILTER_CONTROL_HEIGHT,
        minWidth: 82,
        padding: "0 0.7rem",
      }}
      onClick={() => { setAdminClaimsView("in_progress"); setAdminClaimsStatusFilter(""); }}
    >
      В работе
    </Button>
    <Button
      type="button"
      className="filter-button"
      style={{
        background: adminClaimsView === "all" ? "var(--color-primary-blue)" : undefined,
        color: adminClaimsView === "all" ? "white" : undefined,
        height: CLAIMS_FILTER_CONTROL_HEIGHT,
        minWidth: 56,
        padding: "0 0.7rem",
      }}
      onClick={() => setAdminClaimsView("all")}
    >
      Все
    </Button>
  </Flex>
  {adminClaimsKpi && (
    <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: "0.75rem" }}>
      <div className="cargo-card" style={{ padding: "0 0.65rem", minWidth: 130, minHeight: CLAIMS_FILTER_CONTROL_HEIGHT, display: "flex", alignItems: "center" }}>
        <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
          Активные: <strong style={{ color: "var(--color-text-primary)" }}>{Number(adminClaimsKpi.activeCount || 0)}</strong>
        </Typography.Body>
      </div>
      <div className="cargo-card" style={{ padding: "0 0.65rem", minWidth: 130, minHeight: CLAIMS_FILTER_CONTROL_HEIGHT, display: "flex", alignItems: "center" }}>
        <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
          Просроченные: <strong style={{ color: Number(adminClaimsKpi.overdueCount || 0) > 0 ? "#ef4444" : "var(--color-text-primary)" }}>{Number(adminClaimsKpi.overdueCount || 0)}</strong>
        </Typography.Body>
      </div>
      <div className="cargo-card" style={{ padding: "0 0.65rem", minWidth: 170, minHeight: CLAIMS_FILTER_CONTROL_HEIGHT, display: "flex", alignItems: "center" }}>
        <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
          Сумма требований: <strong style={{ color: "var(--color-text-primary)" }}>{Number(adminClaimsKpi.requestedSum || 0).toLocaleString("ru-RU")} ₽</strong>
        </Typography.Body>
      </div>
      <div className="cargo-card" style={{ padding: "0 0.65rem", minWidth: 190, minHeight: CLAIMS_FILTER_CONTROL_HEIGHT, display: "flex", alignItems: "center" }}>
        <Typography.Body style={{ fontSize: "0.76rem", color: "var(--color-text-secondary)" }}>
          Сумма одобренных: <strong style={{ color: "var(--color-text-primary)" }}>{Number(adminClaimsKpi.approvedSum || 0).toLocaleString("ru-RU")} ₽</strong>
        </Typography.Body>
      </div>
    </Flex>
  )}
  {adminClaimsChart.length > 0 && (
    <div style={{ marginBottom: "0.75rem", border: "1px solid var(--color-border)", borderRadius: 10, padding: "0.6rem 0.7rem" }}>
      <Typography.Body style={{ fontSize: "0.78rem", color: "var(--color-text-secondary)", marginBottom: "0.3rem" }}>
        Динамика за 30 дней
      </Typography.Body>
      <Flex gap="0.4rem" wrap="wrap">
        {adminClaimsChart.slice(-14).map((p) => (
          <span key={p.day} style={{ fontSize: "0.72rem", padding: "0.12rem 0.42rem", borderRadius: 999, background: "var(--color-bg-hover)", border: "1px solid var(--color-border)" }}>
            {String(p.day).slice(5)}: {Number(p.count || 0)}
          </span>
        ))}
      </Flex>
    </div>
  )}
  <Flex gap="0.5rem" wrap="wrap" align="center" style={{ marginBottom: "0.75rem" }}>
    <Input
      type="text"
      className="admin-form-input"
      placeholder="Поиск: номер претензии / перевозка / заказчик"
      value={adminClaimsSearch}
      onChange={(e) => setAdminClaimsSearch(e.target.value)}
      style={{ minWidth: 280, maxWidth: 420, height: CLAIMS_FILTER_CONTROL_HEIGHT, padding: "0 0.55rem", boxSizing: "border-box" }}
    />
    <select
      className="admin-form-input"
      value={adminClaimsStatusFilter}
      onChange={(e) => { setAdminClaimsView("all"); setAdminClaimsStatusFilter(e.target.value); }}
      style={{ padding: "0 0.5rem", height: CLAIMS_FILTER_CONTROL_HEIGHT, minWidth: 210, boxSizing: "border-box" }}
    >
      <option value="">Все статусы</option>
      <option value="new">Новая</option>
      <option value="under_review">На рассмотрении</option>
      <option value="waiting_docs">Ожидает документы</option>
      <option value="in_progress">В работе</option>
      <option value="awaiting_leader">Ожидает решения руководителя</option>
      <option value="sent_to_accounting">Передана в бухгалтерию</option>
      <option value="approved">Удовлетворена</option>
      <option value="paid">Выплачено</option>
      <option value="offset">Зачтено</option>
      <option value="rejected">Отказ</option>
    </select>
    <Button
      type="button"
      className="filter-button"
      style={{ height: CLAIMS_FILTER_CONTROL_HEIGHT, minWidth: 92, padding: "0 0.65rem" }}
      onClick={() => reloadAdminClaims()}
      disabled={adminClaimsLoading}
    >
      {adminClaimsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Обновить"}
    </Button>
  </Flex>
  {adminClaimsLoading ? (
    <Flex align="center" gap="0.5rem">
      <Loader2 className="w-4 h-4 animate-spin" />
      <Typography.Body>Загрузка претензий...</Typography.Body>
    </Flex>
  ) : adminClaims.length === 0 ? (
    <Typography.Body style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
      Претензий не найдено
    </Typography.Body>
  ) : (
    <div style={{ maxHeight: 360, overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
        <thead>
          <tr style={{ background: "var(--color-bg-hover)", borderBottom: "1px solid var(--color-border)" }}>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Претензия</th>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Заказчик</th>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Перевозка</th>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Сумма</th>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Статус</th>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Дней</th>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Действия</th>
          </tr>
        </thead>
        <tbody>
          {adminClaims.map((c) => (
            <tr key={c.id} style={{ borderBottom: "1px solid var(--color-border)", cursor: "pointer" }} onClick={() => setAdminClaimDetailId(c.id)}>
              <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{c.claimNumber || `#${c.id}`}</td>
              <td style={{ padding: "6px 8px" }}>{c.customerCompanyName || c.customerInn || "—"}</td>
              <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{c.cargoNumber || "—"}</td>
              <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                {c.approvedAmount != null ? `${Number(c.approvedAmount).toLocaleString("ru-RU")} ₽` : c.requestedAmount != null ? `${Number(c.requestedAmount).toLocaleString("ru-RU")} ₽` : "—"}
              </td>
              <td style={{ padding: "6px 8px" }}>
                <span
                  className="role-badge"
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    padding: "0.15rem 0.35rem",
                    borderRadius: "999px",
                    background: c.status === "rejected"
                      ? "rgba(239, 68, 68, 0.2)"
                      : c.status === "approved" || c.status === "paid" || c.status === "offset"
                        ? "rgba(34, 197, 94, 0.2)"
                        : "rgba(59, 130, 246, 0.15)",
                    color: c.status === "rejected"
                      ? "#ef4444"
                      : c.status === "approved" || c.status === "paid" || c.status === "offset"
                        ? "#22c55e"
                        : "var(--color-primary-blue)",
                    border: "1px solid var(--color-border)",
                    whiteSpace: "nowrap",
                    display: "inline-block",
                  }}
                >
                  {CLAIM_STATUS_LABELS_RU[String(c.status || "")] || c.status || "—"}
                </span>
              </td>
              <td style={{ padding: "6px 8px", whiteSpace: "nowrap", color: c.daysInWork > 10 ? "#ef4444" : undefined }}>{c.daysInWork}</td>
              <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                <Flex gap="0.25rem" wrap="wrap">
                  {(c.status === "approved" || c.status === "sent_to_accounting") && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); updateAdminClaimStatus(c.id, "paid", c.approvedAmount); }}
                      disabled={adminClaimsUpdatingId === c.id}
                      style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #8b5cf6", background: "transparent", color: "#8b5cf6", cursor: "pointer" }}
                    >
                      Оплачено
                    </button>
                  )}
                  {(c.status === "approved" || c.status === "sent_to_accounting") && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); updateAdminClaimStatus(c.id, "offset", c.approvedAmount); }}
                      disabled={adminClaimsUpdatingId === c.id}
                      style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #10b981", background: "transparent", color: "#10b981", cursor: "pointer" }}
                    >
                      Зачтено
                    </button>
                  )}
                  {c.status !== "rejected" && c.status !== "paid" && c.status !== "offset" && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); updateAdminClaimStatus(c.id, "rejected"); }}
                      disabled={adminClaimsUpdatingId === c.id}
                      style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #ef4444", background: "transparent", color: "#ef4444", cursor: "pointer" }}
                    >
                      Отказ
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deleteAdminClaim(c.id); }}
                    disabled={adminClaimsUpdatingId === c.id}
                    style={{ fontSize: "0.68rem", padding: "0.2rem 0.45rem", borderRadius: 6, border: "1px solid #b91c1c", background: "transparent", color: "#b91c1c", cursor: "pointer" }}
                  >
                    Удалить
                  </button>
                </Flex>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</Panel>

<AdminClaimDetailPanel isSuperAdmin={isSuperAdmin} claims={claims} />
    </>
  );
}

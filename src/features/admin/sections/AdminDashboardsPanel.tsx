import React, { lazy, Suspense, useState } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import { AdminDeliveredWithoutAppSection } from "./AdminDeliveredWithoutAppSection";
import { AdminFotDashboardSection } from "./AdminFotDashboardSection";
import { AdminHaulzDispatchSection } from "./AdminHaulzDispatchSection";
import { AdminLastMileReportSection } from "./AdminLastMileReportSection";
import { AdminUserActivitySection } from "./AdminUserActivitySection";

const AdminMagistralAnalysisSection = lazy(() =>
  import("./AdminMagistralAnalysisSection").then((m) => ({ default: m.AdminMagistralAnalysisSection })),
);
const AdminSendingsAnalysisSection = lazy(() =>
  import("./AdminSendingsAnalysisSection").then((m) => ({ default: m.AdminSendingsAnalysisSection })),
);

type AdminDashboardSubTab = "fot" | "last_mile" | "haulz_dispatch" | "magistral" | "sendings" | "delivered_no_app" | "user_activity";

function AdminDashboardSectionLoader() {
  return (
    <Flex align="center" gap="0.5rem" style={{ padding: "1.5rem 0", color: "var(--color-text-secondary)" }}>
      <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
      Загрузка раздела…
    </Flex>
  );
}

export function AdminDashboardsPanel({ adminToken }: { adminToken: string }) {
  const [sub, setSub] = useState<AdminDashboardSubTab>("fot");

  return (
    <div style={{ maxWidth: 1200 }}>
      <Typography.Headline style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.75rem" }}>Дашборды</Typography.Headline>
      <Typography.Body style={{ fontSize: "0.88rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
        ФОТ по табелю (помесячно и по подразделениям), отчёт последней мили по ТС, сводка выдачи грузов, анализ скорости магистрали и отправок, доставленные без АПП и активность пользователей. Доступно суперадминистратору CMS.
      </Typography.Body>

      <Flex gap="0.5rem" wrap="wrap" style={{ marginBottom: "1rem" }}>
        <Button
          type="button"
          className="filter-button"
          style={{
            background: sub === "fot" ? "var(--color-primary-blue)" : undefined,
            color: sub === "fot" ? "white" : undefined,
          }}
          onClick={() => setSub("fot")}
        >
          ФОТ
        </Button>
        <Button
          type="button"
          className="filter-button"
          style={{
            background: sub === "last_mile" ? "var(--color-primary-blue)" : undefined,
            color: sub === "last_mile" ? "white" : undefined,
          }}
          onClick={() => setSub("last_mile")}
        >
          Последняя миля
        </Button>
        <Button
          type="button"
          className="filter-button"
          style={{
            background: sub === "haulz_dispatch" ? "var(--color-primary-blue)" : undefined,
            color: sub === "haulz_dispatch" ? "white" : undefined,
          }}
          onClick={() => setSub("haulz_dispatch")}
        >
          Выдача грузов
        </Button>
        <Button
          type="button"
          className="filter-button"
          style={{
            background: sub === "magistral" ? "var(--color-primary-blue)" : undefined,
            color: sub === "magistral" ? "white" : undefined,
          }}
          onClick={() => setSub("magistral")}
        >
          Анализ магистрали
        </Button>
        <Button
          type="button"
          className="filter-button"
          style={{
            background: sub === "sendings" ? "var(--color-primary-blue)" : undefined,
            color: sub === "sendings" ? "white" : undefined,
          }}
          onClick={() => setSub("sendings")}
        >
          Анализ отправок
        </Button>
        <Button
          type="button"
          className="filter-button"
          style={{
            background: sub === "delivered_no_app" ? "var(--color-primary-blue)" : undefined,
            color: sub === "delivered_no_app" ? "white" : undefined,
          }}
          onClick={() => setSub("delivered_no_app")}
        >
          Без АПП
        </Button>
        <Button
          type="button"
          className="filter-button"
          style={{
            background: sub === "user_activity" ? "var(--color-primary-blue)" : undefined,
            color: sub === "user_activity" ? "white" : undefined,
          }}
          onClick={() => setSub("user_activity")}
        >
          Активность пользователей
        </Button>
      </Flex>

      {sub === "fot" && <AdminFotDashboardSection adminToken={adminToken} />}
      {sub === "last_mile" && <AdminLastMileReportSection adminToken={adminToken} />}
      {sub === "haulz_dispatch" && <AdminHaulzDispatchSection adminToken={adminToken} />}
      {sub === "magistral" && (
        <Suspense fallback={<AdminDashboardSectionLoader />}>
          <AdminMagistralAnalysisSection adminToken={adminToken} />
        </Suspense>
      )}
      {sub === "sendings" && (
        <Suspense fallback={<AdminDashboardSectionLoader />}>
          <AdminSendingsAnalysisSection adminToken={adminToken} />
        </Suspense>
      )}
      {sub === "delivered_no_app" && <AdminDeliveredWithoutAppSection adminToken={adminToken} />}
      {sub === "user_activity" && <AdminUserActivitySection adminToken={adminToken} />}
    </div>
  );
}

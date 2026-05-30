import React, { useState } from "react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import { AdminFotDashboardSection } from "./AdminFotDashboardSection";
import { AdminHaulzDispatchSection } from "./AdminHaulzDispatchSection";
import { AdminUserActivitySection } from "./AdminUserActivitySection";

type AdminDashboardSubTab = "fot" | "haulz_dispatch" | "user_activity";

export function AdminDashboardsPanel({ adminToken }: { adminToken: string }) {
  const [sub, setSub] = useState<AdminDashboardSubTab>("fot");

  return (
    <div style={{ maxWidth: 1200 }}>
      <Typography.Headline style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.75rem" }}>Дашборды</Typography.Headline>
      <Typography.Body style={{ fontSize: "0.88rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
        ФОТ по табелю и сводка выдачи грузов из кэша перевозок. Доступно суперадминистратору CMS.
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
            background: sub === "user_activity" ? "var(--color-primary-blue)" : undefined,
            color: sub === "user_activity" ? "white" : undefined,
          }}
          onClick={() => setSub("user_activity")}
        >
          Активность пользователей
        </Button>
      </Flex>

      {sub === "fot" && <AdminFotDashboardSection adminToken={adminToken} />}
      {sub === "haulz_dispatch" && <AdminHaulzDispatchSection adminToken={adminToken} />}
      {sub === "user_activity" && <AdminUserActivitySection adminToken={adminToken} />}
    </div>
  );
}

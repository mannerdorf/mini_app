import React from "react";
import { Button, Flex } from "@maxhub/max-ui";
import {
  Users,
  Building2,
  History,
  Layers,
  Calendar,
  Clock,
  Receipt,
  BarChart3,
  Calculator,
  ClipboardList,
  FileText,
  Ship,
  MapPin,
  LayoutDashboard,
  AlertCircle,
  Activity,
} from "lucide-react";
import type { AdminTab } from "../hooks/useAdminTab";
import type { AccountingSubsection } from "../types/expenseAccounting";

type AdminPageNavProps = {
  tab: AdminTab;
  setTab: (tab: AdminTab) => void;
  isSuperAdmin: boolean;
  accountingSubsection: AccountingSubsection;
  setAccountingSubsection: (subsection: AccountingSubsection) => void;
};

const tabBtnStyle = (active: boolean, activeBg?: string) => ({
  background: active ? (activeBg ?? "var(--color-primary-blue)") : undefined,
  color: active ? "white" : undefined,
});

export function AdminPageNav({
  tab,
  setTab,
  isSuperAdmin,
  accountingSubsection,
  setAccountingSubsection,
}: AdminPageNavProps) {
  const isJournalTab = tab === "audit" || tab === "logs" || tab === "integrations" || tab === "legal";
  const isDirectoryTab =
    tab === "users" ||
    tab === "customers" ||
    tab === "suppliers" ||
    tab === "tariffs" ||
    tab === "sverki" ||
    tab === "dogovors" ||
    tab === "ferries" ||
    tab === "haulz_calculator" ||
    tab === "pvz" ||
    tab === "employee_directory" ||
    tab === "subdivisions" ||
    tab === "presets";

  return (
    <>
      <Flex gap="0.5rem" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
        <Button
          className="filter-button"
          style={tabBtnStyle(isDirectoryTab)}
          onClick={() => setTab("users")}
        >
          <Users className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          Справочники
        </Button>
        <Button
          className="filter-button"
          style={tabBtnStyle(isJournalTab)}
          onClick={() => setTab("audit")}
        >
          <History className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
          Журналы
        </Button>
        {isSuperAdmin && (
          <Button
            className="filter-button"
            style={tabBtnStyle(tab === "payment_calendar")}
            onClick={() => setTab("payment_calendar")}
          >
            <Calendar className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Платёжный календарь
          </Button>
        )}
        {isSuperAdmin && (
          <Button
            className="filter-button"
            style={tabBtnStyle(tab === "work_schedule")}
            onClick={() => setTab("work_schedule")}
          >
            <Clock className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            График работы
          </Button>
        )}
        {isSuperAdmin && (
          <Button
            className="filter-button"
            style={tabBtnStyle(tab === "timesheet")}
            onClick={() => setTab("timesheet")}
          >
            <Calendar className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Табель учета рабочего времени
          </Button>
        )}
        {isSuperAdmin && (
          <Button
            className="filter-button"
            style={tabBtnStyle(tab === "expense_requests")}
            onClick={() => setTab("expense_requests")}
          >
            <ClipboardList className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Заявки на расходы
          </Button>
        )}
        {isSuperAdmin && (
          <Button
            className="filter-button"
            style={tabBtnStyle(tab === "accounting", "#dc2626")}
            onClick={() => setTab("accounting")}
          >
            <Calculator className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Бухгалтерия
          </Button>
        )}
        {isSuperAdmin && (
          <Button
            className="filter-button"
            style={tabBtnStyle(tab === "accounting" && accountingSubsection === "claims")}
            onClick={() => {
              setTab("accounting");
              setAccountingSubsection("claims");
            }}
          >
            <FileText className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Претензии
          </Button>
        )}
        {isSuperAdmin && (
          <Button
            className="filter-button"
            style={tabBtnStyle(tab === "dashboards")}
            onClick={() => setTab("dashboards")}
          >
            <LayoutDashboard className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Дашборды
          </Button>
        )}
        {isSuperAdmin && (
          <Button
            className="filter-button"
            style={tabBtnStyle(tab === "pnl", "#7c3aed")}
            onClick={() => setTab("pnl")}
          >
            <BarChart3 className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            PNL
          </Button>
        )}
      </Flex>

      {isDirectoryTab && (
        <Flex gap="0.5rem" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
          <Button className="filter-button" style={tabBtnStyle(tab === "users")} onClick={() => setTab("users")}>
            <Users className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Справочник пользователей
          </Button>
          <Button className="filter-button" style={tabBtnStyle(tab === "customers")} onClick={() => setTab("customers")}>
            <Building2 className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Справочник заказчиков
          </Button>
          <Button className="filter-button" style={tabBtnStyle(tab === "suppliers")} onClick={() => setTab("suppliers")}>
            <Building2 className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Справочник поставщиков
          </Button>
          {isSuperAdmin && (
            <Button
              className="filter-button"
              style={tabBtnStyle(tab === "employee_directory")}
              onClick={() => setTab("employee_directory")}
            >
              <Users className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              Справочник сотрудников
            </Button>
          )}
          {isSuperAdmin && (
            <Button
              className="filter-button"
              style={tabBtnStyle(tab === "subdivisions")}
              onClick={() => setTab("subdivisions")}
            >
              <Building2 className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              Справочник подразделений
            </Button>
          )}
          <Button className="filter-button" style={tabBtnStyle(tab === "tariffs")} onClick={() => setTab("tariffs")}>
            <Receipt className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Справочник Тарифы
          </Button>
          <Button className="filter-button" style={tabBtnStyle(tab === "sverki")} onClick={() => setTab("sverki")}>
            <ClipboardList className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Справочник Акты сверок
          </Button>
          <Button className="filter-button" style={tabBtnStyle(tab === "dogovors")} onClick={() => setTab("dogovors")}>
            <ClipboardList className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Справочник Договоры
          </Button>
          <Button className="filter-button" style={tabBtnStyle(tab === "ferries")} onClick={() => setTab("ferries")}>
            <Ship className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Справочник паромов
          </Button>
          <Button
            className="filter-button"
            style={tabBtnStyle(tab === "haulz_calculator")}
            onClick={() => setTab("haulz_calculator")}
          >
            <Calculator className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Калькулятор HAULZ
          </Button>
          <Button className="filter-button" style={tabBtnStyle(tab === "pvz")} onClick={() => setTab("pvz")}>
            <MapPin className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Справочник ПВЗ
          </Button>
          {isSuperAdmin && (
            <Button className="filter-button" style={tabBtnStyle(tab === "presets")} onClick={() => setTab("presets")}>
              <Layers className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
              Пресеты ролей
            </Button>
          )}
        </Flex>
      )}

      {isJournalTab && (
        <Flex gap="0.5rem" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
          <Button className="filter-button" style={tabBtnStyle(tab === "audit")} onClick={() => setTab("audit")}>
            <History className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Журнал
          </Button>
          <Button className="filter-button" style={tabBtnStyle(tab === "logs")} onClick={() => setTab("logs")}>
            <AlertCircle className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Журнал логов
          </Button>
          <Button
            className="filter-button"
            style={tabBtnStyle(tab === "integrations")}
            onClick={() => setTab("integrations")}
          >
            <Activity className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Здоровье интеграций
          </Button>
          <Button className="filter-button" style={tabBtnStyle(tab === "legal")} onClick={() => setTab("legal")}>
            <FileText className="w-4 h-4" style={{ marginRight: "0.35rem" }} />
            Оферта и согласие
          </Button>
        </Flex>
      )}
    </>
  );
}

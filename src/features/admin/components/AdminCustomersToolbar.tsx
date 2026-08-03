import React from "react";
import { Button, Flex, Input, Typography } from "@maxhub/max-ui";
import { Download, Loader2 } from "lucide-react";
import { SyncDebugPanel } from "../lib/SyncDebugPanel";
import type { AdminCustomersState } from "../hooks/useAdminCustomers";

type Props = Pick<
  AdminCustomersState,
  | "isSuperAdmin"
  | "search"
  | "setSearch"
  | "showOnlyWithoutEmail"
  | "setShowOnlyWithoutEmail"
  | "loading"
  | "list"
  | "syncLoading"
  | "syncMessage"
  | "syncDebugRequest"
  | "syncDebugResponse"
  | "refreshList"
  | "handleExport"
  | "runCacheRefresh"
>;

export function AdminCustomersToolbar({
  isSuperAdmin,
  search,
  setSearch,
  showOnlyWithoutEmail,
  setShowOnlyWithoutEmail,
  loading,
  list,
  syncLoading,
  syncMessage,
  syncDebugRequest,
  syncDebugResponse,
  refreshList,
  handleExport,
  runCacheRefresh,
}: Props) {
  return (
    <>
      <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Справочник заказчиков</Typography.Body>
      <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
        Данные из <code style={{ fontSize: "0.75rem" }}>GETAPI?metod=Getcustomers</code> (сервисный логин 1С), кэш обновляется кроном каждые 15 минут.
      </Typography.Body>
      <Flex gap="var(--element-gap, 0.75rem)" align="center" wrap="wrap" style={{ marginBottom: "var(--space-3, 0.75rem)" }}>
        <label htmlFor="customers-search" className="visually-hidden">Поиск заказчиков по ИНН или наименованию</label>
        <Input
          id="customers-search"
          type="text"
          placeholder="Поиск по ИНН или наименованию..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="admin-form-input"
          style={{ maxWidth: "24rem" }}
          aria-label="Поиск по ИНН или наименованию"
        />
        <label htmlFor="customers-only-without-email" style={{ display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", fontSize: "0.9rem" }}>
          <input
            id="customers-only-without-email"
            type="checkbox"
            checked={showOnlyWithoutEmail}
            onChange={(e) => setShowOnlyWithoutEmail(e.target.checked)}
          />
          <Typography.Body>Только без email</Typography.Body>
        </label>
        <Button
          type="button"
          className="filter-button"
          disabled={loading}
          onClick={refreshList}
          style={{ marginLeft: "auto" }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
          Обновить
        </Button>
        {isSuperAdmin && (
          <>
            <Button type="button" className="filter-button" disabled={syncLoading} onClick={() => void runCacheRefresh(true)}>
              {syncLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
              Тест Getcustomers
            </Button>
            <Button type="button" className="button-primary" disabled={syncLoading} onClick={() => void runCacheRefresh(false)}>
              {syncLoading ? <Loader2 className="w-4 h-4 animate-spin" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} /> : null}
              Обновить из 1С
            </Button>
          </>
        )}
        {isSuperAdmin && (
          <Button
            type="button"
            className="filter-button"
            disabled={loading || list.length === 0}
            onClick={handleExport}
            aria-label="Выгрузить заказчиков в CSV"
          >
            <Download className="w-4 h-4" style={{ verticalAlign: "middle", marginRight: "0.35rem" }} />
            Выгрузить
          </Button>
        )}
      </Flex>
      {syncMessage && (
        <Typography.Body style={{ marginBottom: "0.65rem", fontSize: "0.82rem", color: "var(--color-text-secondary)" }}>
          {syncMessage}
        </Typography.Body>
      )}
      <SyncDebugPanel debugRequest={syncDebugRequest} debugResponse={syncDebugResponse} />
    </>
  );
}

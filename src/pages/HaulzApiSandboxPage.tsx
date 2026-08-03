import React, { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../types";
import { ProfileApiTryConsole } from "../components/profile/ProfileApiTryConsole";
import { HAULZ_INVOICES_SANDBOX_API } from "../constants/haulzSandboxApi";

type Props = {
    activeAccount: Account | null;
    onBack: () => void;
};

/** Профиль → HAULZ → Песочница: тест POST /api/invoices (GetIinvoices). */
export function HaulzApiSandboxPage({ activeAccount, onBack }: Props) {
    const tryAuth = useMemo(
        () =>
            activeAccount?.login && activeAccount.password
                ? {
                      login: activeAccount.login,
                      password: activeAccount.password,
                      inn: activeAccount.activeCustomerInn ?? activeAccount.customers?.[0]?.inn,
                      isRegisteredUser: activeAccount.isRegisteredUser === true,
                  }
                : null,
        [activeAccount],
    );

    if (!tryAuth) {
        return (
            <div className="w-full">
                <Typography.Body>Нет данных для авторизации.</Typography.Body>
                <Button className="filter-button" onClick={onBack} style={{ marginTop: "1rem" }}>
                    Назад
                </Button>
            </div>
        );
    }

    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }} aria-label="Назад">
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline className="text-page-title">Песочница</Typography.Headline>
            </Flex>

            <Typography.Body style={{ fontSize: "0.88rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                Тестовый запрос к прокси <code>POST /api/invoices</code> (1С{" "}
                <code>DeliveryWebService/GetIinvoices</code>). Логин, пароль и ИНН подставляются из текущей сессии.
                Измените период и флаги во вкладке Body, нажмите Send — ответ появится ниже.
            </Typography.Body>

            <Panel className="cargo-card haulz-summary-sandbox" style={{ padding: "var(--pad-card, 1rem)" }}>
                <ProfileApiTryConsole item={HAULZ_INVOICES_SANDBOX_API} tryAuth={tryAuth} autoTestPrefill />
            </Panel>
        </div>
    );
}

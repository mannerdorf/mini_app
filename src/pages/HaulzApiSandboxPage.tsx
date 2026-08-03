import React, { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../types";
import { ProfileApiTryConsole } from "../components/profile/ProfileApiTryConsole";
import { HAULZ_SANDBOX_APIS, getHaulzSandboxApi } from "../constants/haulzSandboxApi";

type Props = {
    activeAccount: Account | null;
    onBack: () => void;
};

/** Профиль → HAULZ → Песочница: тест внутренних прокси 1С. */
export function HaulzApiSandboxPage({ activeAccount, onBack }: Props) {
    const [selectedPath, setSelectedPath] = useState(HAULZ_SANDBOX_APIS[0].path);
    const selectedApi = useMemo(() => getHaulzSandboxApi(selectedPath), [selectedPath]);

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

            <Typography.Body style={{ fontSize: "0.88rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
                Тестовые запросы к прокси 1С. Логин и пароль подставляются из текущей сессии. Выберите метод, при необходимости
                измените тело во вкладке Body и нажмите Send.
            </Typography.Body>

            <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginBottom: "0.75rem" }}>
                <Typography.Body style={{ fontSize: "0.82rem", fontWeight: 600 }}>Метод</Typography.Body>
                <select
                    className="admin-form-input"
                    value={selectedPath}
                    onChange={(e) => setSelectedPath(e.target.value)}
                >
                    {HAULZ_SANDBOX_APIS.map((api) => (
                        <option key={api.path} value={api.path}>
                            {api.navLabel} — {api.path}
                        </option>
                    ))}
                </select>
            </label>

            <Panel className="cargo-card haulz-summary-sandbox" style={{ padding: "var(--pad-card, 1rem)" }}>
                <ProfileApiTryConsole
                    key={selectedPath}
                    item={selectedApi}
                    tryAuth={tryAuth}
                    autoTestPrefill
                />
            </Panel>
        </div>
    );
}

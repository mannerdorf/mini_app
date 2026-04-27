import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import type { Account, AuthData } from "../../types";
import { ExpenseRequestsPage } from "../../pages/ExpenseRequestsPage";

type Props = {
    activeAccount: Account | null;
    onBack: () => void;
};

/** Обёртка HAULZ: заявки на расходы с заголовком «назад». */
export function ProfileExpenseRequestsSection({ activeAccount, onBack }: Props) {
    const auth: AuthData | null = activeAccount
        ? {
              login: activeAccount.login,
              password: activeAccount.password,
              inn: activeAccount.activeCustomerInn ?? undefined,
              ...(activeAccount.isRegisteredUser ? { isRegisteredUser: true } : {}),
          }
        : null;

    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: "1.25rem" }}>Заявки на расходы</Typography.Headline>
            </Flex>
            <ExpenseRequestsPage
                auth={auth}
                departmentName={activeAccount?.customer ?? "Моё подразделение"}
                saasAnalyticsShell
            />
        </div>
    );
}

import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button, Flex, Typography } from "@maxhub/max-ui";
import type { Account, ProfileView } from "../../types";

type Props = {
    activeAccount: Account | null;
    onBack: () => void;
    /** Переходы по подразделам HAULZ (табель, заявки, AIS и т.д.). */
    navigateTo: (view: ProfileView) => void;
    onOpenDocumentsWithSection?: (section: string) => void;
    onOpenWildberries?: () => void;
};

/** Экран подменю HAULZ: кнопки по правам (табель, заявки, AIS, сканер, бухгалтерия, WB). */
export function ProfileHaulzSection({
    activeAccount,
    onBack,
    navigateTo,
    onOpenDocumentsWithSection,
    onOpenWildberries,
}: Props) {
    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: "1.25rem" }}>HAULZ</Typography.Headline>
            </Flex>
            <Flex align="center" gap="0.6rem" wrap="wrap">
                {activeAccount?.permissions?.supervisor === true && activeAccount?.permissions?.haulz === true && (
                    <Button type="button" className="button-primary" onClick={() => navigateTo("departmentTimesheet")}>
                        Табель учета рабочего времени
                    </Button>
                )}
                {activeAccount?.permissions?.haulz === true && (
                    <Button type="button" className="button-primary" onClick={() => navigateTo("expenseRequests")}>
                        Заявки на расходы
                    </Button>
                )}
                {activeAccount?.permissions?.haulz === true && (
                    <Button type="button" className="button-primary" onClick={() => navigateTo("ais")}>
                        AIS
                    </Button>
                )}
                {activeAccount?.permissions?.haulz === true && (
                    <Button type="button" className="button-primary" onClick={() => navigateTo("parcelScanner")}>
                        Сканер посылки
                    </Button>
                )}
                {activeAccount?.permissions?.doc_claims === true && onOpenDocumentsWithSection && (
                    <Button type="button" className="button-primary" onClick={() => onOpenDocumentsWithSection("Претензии")}>
                        Претензии
                    </Button>
                )}
                {activeAccount?.permissions?.accounting === true && (
                    <Button type="button" className="button-primary" onClick={() => navigateTo("accounting")}>
                        Бухгалтерия
                    </Button>
                )}
                {(activeAccount?.permissions?.wb === true || activeAccount?.permissions?.wb_admin === true) && onOpenWildberries && (
                    <Button type="button" className="button-primary" onClick={onOpenWildberries}>
                        Wildberries
                    </Button>
                )}
            </Flex>
        </div>
    );
}

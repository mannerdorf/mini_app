import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../../types";
import { TapSwitch } from "../TapSwitch";

type Props = {
    activeAccount: Account | null;
    activeAccountId: string | null;
    onBack: () => void;
    onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
};

/** Экран «Роли»: заказчик / отправитель / получатель для фильтрации перевозок. */
export function ProfileRolesSection({ activeAccount, activeAccountId, onBack, onUpdateAccount }: Props) {
    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: "1.25rem" }}>Роли</Typography.Headline>
            </Flex>
            <Typography.Body style={{ marginBottom: "1rem", color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>
                Включите роли, если хотите видеть перевозки, где вы выступаете в качестве заказчика, отправителя или получателя.
            </Typography.Body>
            {!activeAccountId || !activeAccount ? (
                <Panel className="cargo-card" style={{ padding: "1rem", textAlign: "center" }}>
                    <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                        Сначала добавьте аккаунт в «Мои компании».
                    </Typography.Body>
                </Panel>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <Panel className="cargo-card" style={{ padding: "1rem" }} onClick={(e) => e.stopPropagation()}>
                        <Flex align="center" justify="space-between" style={{ marginBottom: "0.25rem" }}>
                            <Typography.Body style={{ fontWeight: 600 }}>Заказчик</Typography.Body>
                            <span className="roles-switch-wrap" onClick={(e) => e.stopPropagation()}>
                                <TapSwitch
                                    checked={activeAccount.roleCustomer ?? true}
                                    onToggle={() =>
                                        onUpdateAccount(activeAccountId, { roleCustomer: !(activeAccount.roleCustomer ?? true) })
                                    }
                                />
                            </span>
                        </Flex>
                        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                            Включите, если хотите видеть перевозки, где вы выступаете в качестве заказчика (полные данные, включая стоимость).
                        </Typography.Body>
                    </Panel>
                    <Panel className="cargo-card" style={{ padding: "1rem" }} onClick={(e) => e.stopPropagation()}>
                        <Flex align="center" justify="space-between" style={{ marginBottom: "0.25rem" }}>
                            <Typography.Body style={{ fontWeight: 600 }}>Отправитель</Typography.Body>
                            <span className="roles-switch-wrap" onClick={(e) => e.stopPropagation()}>
                                <TapSwitch
                                    checked={activeAccount.roleSender ?? true}
                                    onToggle={() =>
                                        onUpdateAccount(activeAccountId, { roleSender: !(activeAccount.roleSender ?? true) })
                                    }
                                />
                            </span>
                        </Flex>
                        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                            Включите, если хотите видеть перевозки, где вы выступаете в качестве отправителя (без финансовой информации).
                        </Typography.Body>
                    </Panel>
                    <Panel className="cargo-card" style={{ padding: "1rem" }} onClick={(e) => e.stopPropagation()}>
                        <Flex align="center" justify="space-between" style={{ marginBottom: "0.25rem" }}>
                            <Typography.Body style={{ fontWeight: 600 }}>Получатель</Typography.Body>
                            <span className="roles-switch-wrap" onClick={(e) => e.stopPropagation()}>
                                <TapSwitch
                                    checked={activeAccount.roleReceiver ?? true}
                                    onToggle={() =>
                                        onUpdateAccount(activeAccountId, { roleReceiver: !(activeAccount.roleReceiver ?? true) })
                                    }
                                />
                            </span>
                        </Flex>
                        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                            Включите, если хотите видеть перевозки, где вы выступаете в качестве получателя (без финансовой информации).
                        </Typography.Body>
                    </Panel>
                </div>
            )}
        </div>
    );
}

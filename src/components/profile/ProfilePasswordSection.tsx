import React, { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../../types";

type Props = {
    activeAccount: Account;
    activeAccountId: string;
    onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
};

/** Смена пароля для зарегистрированных пользователей (CMS). */
export function ProfilePasswordSection({ activeAccount, activeAccountId, onUpdateAccount }: Props) {
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [passwordCurrent, setPasswordCurrent] = useState("");
    const [passwordNew, setPasswordNew] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordSuccess, setPasswordSuccess] = useState(false);

    const resetFields = () => {
        setPasswordError(null);
        setPasswordCurrent("");
        setPasswordNew("");
        setPasswordConfirm("");
    };

    return (
        <>
            <Panel
                className="cargo-card profile-saas-row-card"
                onClick={() => setShowPasswordForm((v) => !v)}
                style={{ display: "flex", alignItems: "center", padding: "1rem", cursor: "pointer" }}
            >
                <Flex align="center" style={{ flex: 1, gap: "0.75rem" }}>
                    <div className="profile-saas-row-icon">
                        <Lock className="w-5 h-5" />
                    </div>
                    <Typography.Body className="profile-saas-body" style={{ fontSize: "0.9rem" }}>
                        Пароль
                    </Typography.Body>
                </Flex>
            </Panel>
            {showPasswordForm && (
                <Panel
                    className="cargo-card profile-saas-nested-card"
                    style={{ padding: "1rem" }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Typography.Body
                        className="profile-saas-h3"
                        style={{ marginBottom: "0.75rem", fontSize: "0.9rem", fontWeight: 600 }}
                    >
                        Смена пароля
                    </Typography.Body>
                    <form
                        onSubmit={async (e) => {
                            e.preventDefault();
                            if (!activeAccount?.login || !passwordNew || passwordNew !== passwordConfirm) {
                                setPasswordError(passwordNew !== passwordConfirm ? "Пароли не совпадают" : "Заполните все поля");
                                return;
                            }
                            if (passwordNew.length < 8) {
                                setPasswordError("Новый пароль не менее 8 символов");
                                return;
                            }
                            setPasswordError(null);
                            setPasswordLoading(true);
                            try {
                                const res = await fetch("/api/change-password", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        login: activeAccount.login,
                                        currentPassword: passwordCurrent,
                                        newPassword: passwordNew,
                                    }),
                                });
                                const data = await res.json().catch(() => ({}));
                                if (!res.ok) throw new Error((data?.error as string) || "Ошибка смены пароля");
                                setPasswordSuccess(true);
                                onUpdateAccount(activeAccountId, { password: passwordNew });
                                setPasswordCurrent("");
                                setPasswordNew("");
                                setPasswordConfirm("");
                                setTimeout(() => {
                                    setShowPasswordForm(false);
                                    setPasswordSuccess(false);
                                }, 1500);
                            } catch (err: unknown) {
                                setPasswordError((err as Error)?.message || "Ошибка смены пароля");
                            } finally {
                                setPasswordLoading(false);
                            }
                        }}
                        style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
                    >
                        <div>
                            <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Текущий пароль</Typography.Body>
                            <Input
                                type="password"
                                className="login-input"
                                placeholder="Текущий пароль"
                                value={passwordCurrent}
                                onChange={(e) => setPasswordCurrent(e.target.value)}
                                autoComplete="current-password"
                                style={{ width: "100%" }}
                            />
                        </div>
                        <div>
                            <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Новый пароль</Typography.Body>
                            <Input
                                type="password"
                                className="login-input"
                                placeholder="Не менее 8 символов"
                                value={passwordNew}
                                onChange={(e) => setPasswordNew(e.target.value)}
                                autoComplete="new-password"
                                style={{ width: "100%" }}
                            />
                        </div>
                        <div>
                            <Typography.Body style={{ marginBottom: "0.25rem", fontSize: "0.85rem" }}>Подтвердите новый пароль</Typography.Body>
                            <Input
                                type="password"
                                className="login-input"
                                placeholder="Повторите новый пароль"
                                value={passwordConfirm}
                                onChange={(e) => setPasswordConfirm(e.target.value)}
                                autoComplete="new-password"
                                style={{ width: "100%" }}
                            />
                        </div>
                        {passwordError && (
                            <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem" }}>{passwordError}</Typography.Body>
                        )}
                        {passwordSuccess && (
                            <Typography.Body style={{ color: "var(--color-success-status, #22c55e)", fontSize: "0.85rem" }}>
                                Пароль успешно изменён.
                            </Typography.Body>
                        )}
                        <Flex gap="0.5rem">
                            <Button type="submit" className="button-primary" disabled={passwordLoading}>
                                {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить"}
                            </Button>
                            <Button
                                type="button"
                                className="filter-button"
                                onClick={() => {
                                    setShowPasswordForm(false);
                                    resetFields();
                                }}
                            >
                                Отмена
                            </Button>
                        </Flex>
                    </form>
                </Panel>
            )}
        </>
    );
}

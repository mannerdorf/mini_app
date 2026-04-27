import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../../types";
import { TapSwitch } from "../TapSwitch";
import { fetchTwoFaSettings, persistTwoFaSettingsSilent } from "../../api/client/twoFa";

type Props = {
    activeAccount: Account;
    activeAccountId: string;
    onBack: () => void;
    onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
    onOpenTelegramBot?: () => Promise<void>;
};

export function ProfileTwoFactorSection({
    activeAccount,
    activeAccountId,
    onBack,
    onUpdateAccount,
    onOpenTelegramBot,
}: Props) {
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
    const [twoFactorMethod, setTwoFactorMethod] = useState<"google" | "telegram">("google");
    const [twoFactorTelegramLinked, setTwoFactorTelegramLinked] = useState(false);
    const [tgLinkChecking, setTgLinkChecking] = useState(false);
    const [tgLinkError, setTgLinkError] = useState<string | null>(null);
    const [googleSetupData, setGoogleSetupData] = useState<{ otpauthUrl: string; secret: string } | null>(null);
    const [googleSetupStep, setGoogleSetupStep] = useState<"idle" | "qr" | "verify">("idle");
    const [googleSetupLoading, setGoogleSetupLoading] = useState(false);
    const [googleSetupError, setGoogleSetupError] = useState<string | null>(null);
    const [googleVerifyCode, setGoogleVerifyCode] = useState("");

    const checkTelegramLinkStatus = useCallback(async () => {
        if (!activeAccount?.login) return false;
        try {
            const data = await fetchTwoFaSettings(activeAccount.login);
            const linked = !!data?.settings?.telegramLinked;
            setTwoFactorTelegramLinked(linked);
            onUpdateAccount(activeAccountId, { twoFactorTelegramLinked: linked });
            return linked;
        } catch {
            return false;
        }
    }, [activeAccount?.login, activeAccountId, onUpdateAccount]);

    const pollTelegramLink = useCallback(async () => {
        if (tgLinkChecking) return;
        setTgLinkChecking(true);
        try {
            let attempts = 0;
            let linked = false;
            while (attempts < 10 && !linked) {
                linked = await checkTelegramLinkStatus();
                if (linked) break;
                await new Promise((r) => setTimeout(r, 2000));
                attempts += 1;
            }
        } finally {
            setTgLinkChecking(false);
        }
    }, [checkTelegramLinkStatus, tgLinkChecking]);

    useEffect(() => {
        setTwoFactorEnabled(!!activeAccount.twoFactorEnabled);
        setTwoFactorMethod(activeAccount.twoFactorMethod ?? "google");
        setTwoFactorTelegramLinked(!!activeAccount.twoFactorTelegramLinked);
    }, [activeAccount.id]);

    useEffect(() => {
        if (!twoFactorEnabled || twoFactorMethod !== "telegram") return;
        if (twoFactorTelegramLinked) return;
        void checkTelegramLinkStatus();
    }, [twoFactorEnabled, twoFactorMethod, twoFactorTelegramLinked, checkTelegramLinkStatus]);

    const googleSecretSet = !!activeAccount.twoFactorGoogleSecretSet;
    const showGoogleSetup = twoFactorEnabled && twoFactorMethod === "google" && !googleSecretSet;

    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: "1.25rem" }}>Двухфакторная аутентификация (2FA)</Typography.Headline>
            </Flex>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <Panel className="cargo-card" style={{ padding: "1rem" }}>
                    <Flex align="center" justify="space-between">
                        <Typography.Body style={{ fontSize: "0.9rem" }}>Google Authenticator</Typography.Body>
                        <TapSwitch
                            checked={twoFactorEnabled && twoFactorMethod === "google"}
                            onToggle={() => {
                                if (twoFactorEnabled && twoFactorMethod === "google") {
                                    setTwoFactorEnabled(false);
                                    setTwoFactorMethod("telegram");
                                    setGoogleSetupData(null);
                                    setGoogleSetupStep("idle");
                                    onUpdateAccount(activeAccountId, { twoFactorMethod: "telegram", twoFactorEnabled: false });
                                } else {
                                    setTwoFactorMethod("google");
                                    setTwoFactorEnabled(true);
                                    onUpdateAccount(activeAccountId, { twoFactorMethod: "google", twoFactorEnabled: true });
                                }
                            }}
                        />
                    </Flex>
                    {showGoogleSetup && (
                        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                            {googleSetupStep === "idle" && !googleSetupData && (
                                <>
                                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                                        Отсканируйте QR-код в приложении Google Authenticator или введите ключ вручную.
                                    </Typography.Body>
                                    <Button
                                        className="filter-button"
                                        size="small"
                                        disabled={googleSetupLoading}
                                        onClick={async () => {
                                            if (!activeAccount?.login) return;
                                            setGoogleSetupError(null);
                                            setGoogleSetupLoading(true);
                                            try {
                                                const res = await fetch("/api/2fa-google", {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({ login: activeAccount.login, action: "setup" }),
                                                });
                                                const data = await res.json();
                                                if (!res.ok) throw new Error(data?.error || "Ошибка настройки");
                                                setGoogleSetupData({ otpauthUrl: data.otpauthUrl, secret: data.secret });
                                                setGoogleSetupStep("qr");
                                            } catch (e: unknown) {
                                                setGoogleSetupError((e as Error)?.message || "Не удалось начать настройку");
                                            } finally {
                                                setGoogleSetupLoading(false);
                                            }
                                        }}
                                        style={{ fontSize: "0.85rem", alignSelf: "flex-start" }}
                                    >
                                        {googleSetupLoading ? "Загрузка…" : "Настроить Google Authenticator"}
                                    </Button>
                                </>
                            )}
                            {(googleSetupStep === "qr" || googleSetupData) && googleSetupData && googleSetupStep !== "verify" && (
                                <>
                                    <div style={{ display: "flex", justifyContent: "center" }}>
                                        <img
                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(googleSetupData.otpauthUrl)}`}
                                            alt="QR для Google Authenticator"
                                            style={{ width: 200, height: 200 }}
                                        />
                                    </div>
                                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                                        Ключ для ручного ввода:{" "}
                                        <code style={{ wordBreak: "break-all", fontSize: "0.8rem" }}>{googleSetupData.secret}</code>
                                    </Typography.Body>
                                    <Button
                                        className="filter-button"
                                        size="small"
                                        onClick={() => {
                                            setGoogleSetupStep("verify");
                                            setGoogleVerifyCode("");
                                            setGoogleSetupError(null);
                                        }}
                                        style={{ fontSize: "0.85rem", alignSelf: "flex-start" }}
                                    >
                                        Добавил в приложение
                                    </Button>
                                </>
                            )}
                            {googleSetupStep === "verify" && googleSetupData && (
                                <form
                                    onSubmit={async (e) => {
                                        e.preventDefault();
                                        if (!activeAccount?.login || !googleVerifyCode.trim()) return;
                                        setGoogleSetupError(null);
                                        setGoogleSetupLoading(true);
                                        try {
                                            const res = await fetch("/api/2fa-google", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                    login: activeAccount.login,
                                                    action: "verify",
                                                    code: googleVerifyCode.trim(),
                                                }),
                                            });
                                            const data = await res.json();
                                            if (!res.ok) throw new Error(data?.error || "Неверный код");
                                            await persistTwoFaSettingsSilent({
                                                login: activeAccount.login,
                                                enabled: true,
                                                method: "google",
                                                telegramLinked: false,
                                            });
                                            onUpdateAccount(activeAccountId, {
                                                twoFactorEnabled: true,
                                                twoFactorMethod: "google",
                                                twoFactorGoogleSecretSet: true,
                                            });
                                            setGoogleSetupData(null);
                                            setGoogleSetupStep("idle");
                                            setGoogleVerifyCode("");
                                        } catch (err: unknown) {
                                            setGoogleSetupError((err as Error)?.message || "Неверный код");
                                        } finally {
                                            setGoogleSetupLoading(false);
                                        }
                                    }}
                                    style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
                                >
                                    <Typography.Body style={{ fontSize: "0.85rem" }}>Введите 6-значный код из приложения</Typography.Body>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        maxLength={6}
                                        placeholder="000000"
                                        value={googleVerifyCode}
                                        onChange={(e) => setGoogleVerifyCode(e.target.value.replace(/\D/g, ""))}
                                        style={{ padding: "0.5rem", fontSize: "1rem", textAlign: "center", letterSpacing: "0.25em" }}
                                    />
                                    <Button
                                        type="submit"
                                        className="button-primary"
                                        disabled={googleVerifyCode.length !== 6 || googleSetupLoading}
                                        style={{ alignSelf: "flex-start" }}
                                    >
                                        {googleSetupLoading ? "Проверка…" : "Подтвердить"}
                                    </Button>
                                    {googleSetupError && (
                                        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error-status)" }}>
                                            {googleSetupError}
                                        </Typography.Body>
                                    )}
                                </form>
                            )}
                        </div>
                    )}
                    {twoFactorEnabled && twoFactorMethod === "google" && googleSecretSet && (
                        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-success-status)", marginTop: "0.5rem" }}>
                            Google Authenticator настроен
                        </Typography.Body>
                    )}
                </Panel>
                <Panel className="cargo-card" style={{ padding: "1rem" }}>
                    <Flex
                        align="center"
                        justify="space-between"
                        style={{
                            marginBottom: twoFactorMethod === "telegram" && !twoFactorTelegramLinked && onOpenTelegramBot ? "0.5rem" : 0,
                        }}
                    >
                        <Typography.Body style={{ fontSize: "0.9rem" }}>Telegram</Typography.Body>
                        <TapSwitch
                            checked={twoFactorEnabled && twoFactorMethod === "telegram"}
                            onToggle={() => {
                                if (twoFactorEnabled && twoFactorMethod === "telegram") {
                                    setTwoFactorEnabled(false);
                                    setTwoFactorMethod("google");
                                    onUpdateAccount(activeAccountId, { twoFactorMethod: "google", twoFactorEnabled: false });
                                } else {
                                    setTwoFactorMethod("telegram");
                                    setTwoFactorEnabled(true);
                                    onUpdateAccount(activeAccountId, { twoFactorMethod: "telegram", twoFactorEnabled: true });
                                }
                            }}
                        />
                    </Flex>
                    {twoFactorEnabled && twoFactorMethod === "telegram" && (
                        <>
                            {twoFactorTelegramLinked ? (
                                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-success-status)" }}>
                                    Telegram привязан
                                </Typography.Body>
                            ) : onOpenTelegramBot ? (
                                <>
                                    <Button
                                        className="filter-button"
                                        size="small"
                                        disabled={tgLinkChecking}
                                        onClick={async () => {
                                            setTgLinkError(null);
                                            try {
                                                await onOpenTelegramBot();
                                                void pollTelegramLink();
                                            } catch (e: unknown) {
                                                setTgLinkError((e as { message?: string })?.message || "Не удалось открыть бота.");
                                            }
                                        }}
                                        style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}
                                    >
                                        {tgLinkChecking ? "Проверка…" : "Привязать Telegram"}
                                    </Button>
                                    {tgLinkError && (
                                        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error-status)", marginTop: "0.35rem" }}>
                                            {tgLinkError}
                                        </Typography.Body>
                                    )}
                                </>
                            ) : (
                                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                                    Откройте бота для привязки
                                </Typography.Body>
                            )}
                        </>
                    )}
                </Panel>
            </div>
        </div>
    );
}

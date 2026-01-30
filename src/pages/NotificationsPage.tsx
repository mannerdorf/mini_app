import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../types";
import { urlBase64ToUint8Array } from "../utils";
import { TapSwitch } from "../components/TapSwitch";

const NOTIF_PEREVOZKI: { id: string; label: string }[] = [
    { id: "accepted", label: "Принята" },
    { id: "in_transit", label: "В пути" },
    { id: "delivered", label: "Доставлено" },
];
const NOTIF_DOCS: { id: string; label: string }[] = [
    { id: "bill_paid", label: "Счёт оплачен" },
];

export function NotificationsPage({
    activeAccount,
    activeAccountId,
    onBack,
    onOpenDeveloper,
    onOpenTelegramBot,
    onUpdateAccount,
}: {
    activeAccount: Account | null;
    activeAccountId: string | null;
    onBack: () => void;
    onOpenDeveloper: () => void;
    onOpenTelegramBot?: () => Promise<void>;
    onUpdateAccount?: (accountId: string, patch: Partial<Account>) => void;
}) {
    const [prefs, setPrefs] = useState<{ telegram: Record<string, boolean>; webpush: Record<string, boolean> }>({
        telegram: {},
        webpush: {},
    });
    const [prefsLoading, setPrefsLoading] = useState(true);
    const [prefsSaving, setPrefsSaving] = useState(false);
    const [webPushLoading, setWebPushLoading] = useState(false);
    const [webPushError, setWebPushError] = useState<string | null>(null);
    const [webPushSubscribed, setWebPushSubscribed] = useState(false);
    const [tgLinkLoading, setTgLinkLoading] = useState(false);
    const [tgLinkError, setTgLinkError] = useState<string | null>(null);
    const [telegramLinkedFromApi, setTelegramLinkedFromApi] = useState<boolean | null>(null);

    const login = activeAccount?.login?.trim().toLowerCase() || "";
    const telegramLinked = telegramLinkedFromApi ?? activeAccount?.twoFactorTelegramLinked ?? false;

    const checkTelegramLinked = useCallback(async () => {
        if (!login) return false;
        try {
            const res = await fetch(`/api/2fa?login=${encodeURIComponent(login)}`);
            if (!res.ok) return false;
            const data = await res.json();
            const linked = !!data?.settings?.telegramLinked;
            setTelegramLinkedFromApi(linked);
            if (linked && activeAccountId && onUpdateAccount) onUpdateAccount(activeAccountId, { twoFactorTelegramLinked: true });
            return linked;
        } catch {
            return false;
        }
    }, [login, activeAccountId, onUpdateAccount]);

    useEffect(() => {
        if (!login) {
            setPrefsLoading(false);
            setTelegramLinkedFromApi(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const [prefsRes] = await Promise.all([
                    fetch(`/api/webpush-preferences?login=${encodeURIComponent(login)}`),
                    checkTelegramLinked().then(() => {}),
                ]);
                if (cancelled) return;
                if (prefsRes.ok) {
                    const data = await prefsRes.json();
                    if (!cancelled) setPrefs({ telegram: data.telegram || {}, webpush: data.webpush || {} });
                }
            } catch {
                if (!cancelled) setPrefs({ telegram: {}, webpush: {} });
            } finally {
                if (!cancelled) setPrefsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [login, checkTelegramLinked]);

    const savePrefs = useCallback(
        async (channel: "telegram" | "webpush", eventId: string, value: boolean) => {
            const next = {
                ...prefs,
                [channel]: { ...prefs[channel], [eventId]: value },
            };
            setPrefs(next);
            if (!login) return;
            setPrefsSaving(true);
            try {
                await fetch("/api/webpush-preferences", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login, preferences: next }),
                });
            } catch {
                // revert on error?
            } finally {
                setPrefsSaving(false);
            }
        },
        [login, prefs]
    );

    const enableWebPush = useCallback(async () => {
        if (!login) return;
        if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
            setWebPushError("Уведомления в браузере не поддерживаются.");
            return;
        }
        setWebPushError(null);
        setWebPushLoading(true);
        try {
            let permission = Notification.permission;
            if (permission === "default") {
                permission = await Notification.requestPermission();
            }
            if (permission !== "granted") {
                setWebPushError("Разрешение на уведомления отклонено.");
                setWebPushLoading(false);
                return;
            }
            const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
            await reg.update();
            const res = await fetch("/api/webpush-vapid");
            if (!res.ok) throw new Error("VAPID not configured");
            const { publicKey } = await res.json();
            if (!publicKey) throw new Error("No public key");
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
            const subRes = await fetch("/api/webpush-subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login, subscription: sub.toJSON() }),
            });
            if (!subRes.ok) throw new Error("Failed to save subscription");
            setWebPushSubscribed(true);
        } catch (e: unknown) {
            setWebPushError((e as { message?: string })?.message || "Не удалось включить уведомления.");
        } finally {
            setWebPushLoading(false);
        }
    }, [login]);

    const webPushSupported =
        typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;

    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: "1.25rem" }}>Уведомления</Typography.Headline>
            </Flex>

            {!login ? (
                <Panel className="cargo-card" style={{ padding: "1rem" }}>
                    <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                        Войдите в аккаунт, чтобы настроить уведомления.
                    </Typography.Body>
                </Panel>
            ) : prefsLoading ? (
                <Panel className="cargo-card" style={{ padding: "1rem" }}>
                    <Flex align="center" gap="0.5rem">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <Typography.Body style={{ fontSize: "0.9rem" }}>Загрузка…</Typography.Body>
                    </Flex>
                </Panel>
            ) : (
                <>
                    <Typography.Body style={{ marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                        Telegram
                    </Typography.Body>
                    <Panel className="cargo-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        {!telegramLinked ? (
                            <>
                                <Typography.Body style={{ fontSize: "0.9rem" }}>
                                    Привяжите Telegram, чтобы получать уведомления в боте по образцу: «Создана Перевозка №…», «В пути», «Доставлено», «Счёт по перевозке № … оплачен».
                                </Typography.Body>
                                {onOpenTelegramBot && (
                                    <Button
                                        type="button"
                                        className="button-primary"
                                        disabled={tgLinkLoading}
                                        onClick={async () => {
                                            setTgLinkError(null);
                                            setTgLinkLoading(true);
                                            try {
                                                await onOpenTelegramBot();
                                            } catch (e: unknown) {
                                                setTgLinkError((e as { message?: string })?.message || "Не удалось открыть Telegram.");
                                            } finally {
                                                setTgLinkLoading(false);
                                            }
                                        }}
                                    >
                                        {tgLinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Привязать Telegram"}
                                    </Button>
                                )}
                                {tgLinkError && (
                                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }}>
                                        {tgLinkError}
                                    </Typography.Body>
                                )}
                                <Typography.Body
                                    style={{ fontSize: "0.8rem", color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline" }}
                                    onClick={() => checkTelegramLinked()}
                                >
                                    Проверить привязку
                                </Typography.Body>
                            </>
                        ) : (
                            <>
                                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-success, #22c55e)" }}>
                                    Telegram подключён.
                                </Typography.Body>
                                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>
                                    Раздел «Перевозки»
                                </Typography.Body>
                                {NOTIF_PEREVOZKI.map((ev) => (
                                    <Flex key={ev.id} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                                        <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                                        <TapSwitch
                                            checked={!!prefs.telegram[ev.id]}
                                            onToggle={() => savePrefs("telegram", ev.id, !prefs.telegram[ev.id])}
                                        />
                                    </Flex>
                                ))}
                                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.5rem", marginBottom: "0.25rem" }}>
                                    Раздел «Документы»
                                </Typography.Body>
                                {NOTIF_DOCS.map((ev) => (
                                    <Flex key={ev.id} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                                        <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                                        <TapSwitch
                                            checked={!!prefs.telegram[ev.id]}
                                            onToggle={() => savePrefs("telegram", ev.id, !prefs.telegram[ev.id])}
                                        />
                                    </Flex>
                                ))}
                            </>
                        )}
                    </Panel>

                    <Typography.Body style={{ marginTop: "1.25rem", marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                        Web Push (браузер)
                    </Typography.Body>
                    <Panel className="cargo-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        {webPushSupported && (
                            <>
                                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                                    Уведомления в браузере (Chrome, Edge, Firefox; на iOS — после добавления на экран «Домой»).
                                </Typography.Body>
                                {!webPushSubscribed && (
                                    <Button
                                        type="button"
                                        className="button-primary"
                                        disabled={webPushLoading}
                                        onClick={enableWebPush}
                                    >
                                        {webPushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Включить уведомления в браузере"}
                                    </Button>
                                )}
                                {webPushSubscribed && (
                                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-success, #22c55e)" }}>
                                        Уведомления в браузере включены.
                                    </Typography.Body>
                                )}
                                {webPushError && (
                                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }}>
                                        {webPushError}
                                    </Typography.Body>
                                )}
                                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.25rem", marginBottom: "0.25rem" }}>
                                    Раздел «Перевозки»
                                </Typography.Body>
                                {NOTIF_PEREVOZKI.map((ev) => (
                                    <Flex key={ev.id} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                                        <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                                        <TapSwitch
                                            checked={!!prefs.webpush[ev.id]}
                                            onToggle={() => savePrefs("webpush", ev.id, !prefs.webpush[ev.id])}
                                        />
                                    </Flex>
                                ))}
                                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.5rem", marginBottom: "0.25rem" }}>
                                    Раздел «Документы»
                                </Typography.Body>
                                {NOTIF_DOCS.map((ev) => (
                                    <Flex key={ev.id} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                                        <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                                        <TapSwitch
                                            checked={!!prefs.webpush[ev.id]}
                                            onToggle={() => savePrefs("webpush", ev.id, !prefs.webpush[ev.id])}
                                        />
                                    </Flex>
                                ))}
                            </>
                        )}
                        {!webPushSupported && (
                            <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                                Web Push доступен в браузерах (Chrome, Edge, Firefox). В мини‑приложении внутри соцсетей может быть недоступен.
                            </Typography.Body>
                        )}
                    </Panel>

                    <Typography.Body
                        style={{ marginTop: "1.5rem", fontSize: "0.8rem", color: "var(--color-text-secondary)", cursor: "pointer", textDecoration: "underline" }}
                        onClick={onOpenDeveloper}
                    >
                        Для разработчиков
                    </Typography.Body>
                </>
            )}
        </div>
    );
}

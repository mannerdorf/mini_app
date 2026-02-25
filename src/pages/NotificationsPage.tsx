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
    { id: "bill_created", label: "Создан счёт" },
    { id: "bill_paid", label: "Счёт оплачен" },
];
const NOTIF_SUMMARY: { id: string; label: string }[] = [
    { id: "daily_summary", label: "Ежедневная сводка в 10:00" },
];

export function NotificationsPage({
    activeAccount,
    activeAccountId,
    onBack,
    onOpenDeveloper,
    onOpenTelegramBot,
    onOpenMaxBot,
    onUpdateAccount,
}: {
    activeAccount: Account | null;
    activeAccountId: string | null;
    onBack: () => void;
    onOpenDeveloper: () => void;
    onOpenTelegramBot?: () => Promise<void>;
    onOpenMaxBot?: () => Promise<void>;
    onUpdateAccount?: (accountId: string, patch: Partial<Account>) => void;
}) {
    const FETCH_TIMEOUT_MS = 8000;
    const withTimeout = async <T,>(factory: (signal: AbortSignal) => Promise<T>, timeoutMs = FETCH_TIMEOUT_MS): Promise<T> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await factory(controller.signal);
        } finally {
            clearTimeout(timer);
        }
    };

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
    const [tgUnlinkLoading, setTgUnlinkLoading] = useState(false);
    const [maxLinkLoading, setMaxLinkLoading] = useState(false);
    const [maxLinkError, setMaxLinkError] = useState<string | null>(null);
    const [telegramLinkedFromApi, setTelegramLinkedFromApi] = useState<boolean | null>(null);
    const [maxLinkedFromApi, setMaxLinkedFromApi] = useState<boolean | null>(null);

    const login = activeAccount?.login?.trim().toLowerCase() || "";
    const telegramLinked = telegramLinkedFromApi ?? activeAccount?.twoFactorTelegramLinked ?? false;
    const maxLinked = maxLinkedFromApi ?? false;

    const checkTelegramLinked = useCallback(async () => {
        if (!login) return false;
        try {
            const res = await withTimeout(
                (signal) => fetch(`/api/2fa?login=${encodeURIComponent(login)}`, { signal }),
                FETCH_TIMEOUT_MS
            );
            if (!res.ok) return false;
            const data = await res.json();
            const linked = !!data?.settings?.telegramLinked;
            setTelegramLinkedFromApi(linked);
            setMaxLinkedFromApi(!!data?.settings?.maxLinked);
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
            setMaxLinkedFromApi(null);
            return;
        }
        let cancelled = false;
        const hardStop = setTimeout(() => {
            if (!cancelled) setPrefsLoading(false);
        }, FETCH_TIMEOUT_MS + 2000);
        (async () => {
            try {
                const prefsRes = await withTimeout(
                    (signal) => fetch(`/api/webpush-preferences?login=${encodeURIComponent(login)}`, { signal }),
                    FETCH_TIMEOUT_MS
                ).catch(() => null);
                checkTelegramLinked().catch(() => {});
                if (cancelled) return;
                if (prefsRes?.ok) {
                    const data = await prefsRes.json();
                    if (!cancelled) setPrefs({ telegram: data.telegram || {}, webpush: data.webpush || {} });
                } else {
                    if (!cancelled) setPrefs({ telegram: {}, webpush: {} });
                }
            } catch {
                if (!cancelled) setPrefs({ telegram: {}, webpush: {} });
            } finally {
                if (!cancelled) setPrefsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
            clearTimeout(hardStop);
        };
    }, [login, checkTelegramLinked]);

    const savePrefs = useCallback(
        async (channel: "telegram" | "webpush", eventId: string, value: boolean) => {
            let nextPrefs: { telegram: Record<string, boolean>; webpush: Record<string, boolean> } | null = null;
            setPrefs((prev) => {
                const next = {
                    ...prev,
                    [channel]: { ...prev[channel], [eventId]: value },
                };
                nextPrefs = next;
                return next;
            });
            if (!login || !nextPrefs) return;
            setPrefsSaving(true);
            try {
                const res = await fetch("/api/webpush-preferences", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login, preferences: nextPrefs }),
                });
                if (!res.ok) {
                    throw new Error("Не удалось сохранить настройки уведомлений.");
                }
            } catch {
                setTgLinkError("Не удалось сохранить настройки. Проверьте миграции notification_preferences.");
            } finally {
                setPrefsSaving(false);
            }
        },
        [login]
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

    const disableTelegram = useCallback(async () => {
        if (!login) return;
        setTgLinkError(null);
        setTgUnlinkLoading(true);
        try {
            const res = await fetch("/api/telegram-unlink", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login }),
            });
            let ok = false;
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                ok = !!data?.ok;
            }
            if (!ok) {
                const fallbackRes = await fetch("/api/2fa-telegram", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login, action: "unlink" }),
                });
                const fallbackData = await fallbackRes.json().catch(() => ({}));
                if (!fallbackRes.ok || !fallbackData?.ok) {
                    throw new Error(fallbackData?.error || "Не удалось отключить Telegram.");
                }
            }

            const telegramOff: Record<string, boolean> = {
                accepted: false,
                in_transit: false,
                delivered: false,
                bill_created: false,
                bill_paid: false,
                daily_summary: false,
            };
            const nextPrefs = { ...prefs, telegram: { ...prefs.telegram, ...telegramOff } };
            setPrefs(nextPrefs);
            await fetch("/api/webpush-preferences", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login, preferences: nextPrefs }),
            }).catch(() => {});

            setTelegramLinkedFromApi(false);
            if (activeAccountId && onUpdateAccount) onUpdateAccount(activeAccountId, { twoFactorTelegramLinked: false });
            setTgLinkError(null);
        } catch (e: unknown) {
            setTgLinkError((e as { message?: string })?.message || "Не удалось отключить Telegram.");
        } finally {
            setTgUnlinkLoading(false);
        }
    }, [login, prefs, activeAccountId, onUpdateAccount]);

    const webPushSupported =
        typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
    const SHOW_WEB_PUSH_SECTION = false;

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
                        Чат-бот Telegram HAULZinfobot
                    </Typography.Body>
                    <Panel className="cargo-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        {onOpenTelegramBot && (
                            <Button
                                type="button"
                                className="filter-button"
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
                                {tgLinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Открыть HAULZinfobot"}
                            </Button>
                        )}
                        {!telegramLinked ? (
                            <>
                                <Typography.Body style={{ fontSize: "0.9rem" }}>
                                    Для активации откройте HAULZinfobot и введите логин или ИНН. Затем подтвердите пин-код из email.
                                </Typography.Body>
                                {tgLinkError && (
                                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }}>
                                        {tgLinkError}
                                    </Typography.Body>
                                )}
                                {onOpenMaxBot && (
                                    <Button
                                        type="button"
                                        className="button-primary"
                                        disabled={maxLinkLoading}
                                        onClick={async () => {
                                            setMaxLinkError(null);
                                            setMaxLinkLoading(true);
                                            try {
                                                await onOpenMaxBot();
                                            } catch (e: unknown) {
                                                setMaxLinkError((e as { message?: string })?.message || "Не удалось открыть MAX.");
                                            } finally {
                                                setMaxLinkLoading(false);
                                            }
                                        }}
                                    >
                                        {maxLinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Привязать MAX"}
                                    </Button>
                                )}
                                {maxLinkError && (
                                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }}>
                                        {maxLinkError}
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
                                <Button
                                    type="button"
                                    className="button-secondary"
                                    disabled={tgUnlinkLoading}
                                    onClick={disableTelegram}
                                >
                                    {tgUnlinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Отключить Telegram"}
                                </Button>
                                {tgLinkError && (
                                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }}>
                                        {tgLinkError}
                                    </Typography.Body>
                                )}
                                {maxLinked ? (
                                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-success, #22c55e)" }}>
                                        MAX подключён.
                                    </Typography.Body>
                                ) : onOpenMaxBot ? (
                                    <Button
                                        type="button"
                                        className="button-primary"
                                        disabled={maxLinkLoading}
                                        onClick={async () => {
                                            setMaxLinkError(null);
                                            setMaxLinkLoading(true);
                                            try {
                                                await onOpenMaxBot();
                                            } catch (e: unknown) {
                                                setMaxLinkError((e as { message?: string })?.message || "Не удалось открыть MAX.");
                                            } finally {
                                                setMaxLinkLoading(false);
                                            }
                                        }}
                                    >
                                        {maxLinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Привязать MAX"}
                                    </Button>
                                ) : null}
                                {maxLinkError && (
                                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }}>
                                        {maxLinkError}
                                    </Typography.Body>
                                )}
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
                                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.5rem", marginBottom: "0.25rem" }}>
                                    Сводка
                                </Typography.Body>
                                {NOTIF_SUMMARY.map((ev) => (
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

                    {SHOW_WEB_PUSH_SECTION && (
                        <>
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
                                        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.5rem", marginBottom: "0.25rem" }}>
                                            Сводка
                                        </Typography.Body>
                                        {NOTIF_SUMMARY.map((ev) => (
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
                        </>
                    )}

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

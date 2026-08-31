import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../types";
import {
    fetchNotificationPreferences,
    saveNotificationPreferences,
    saveNotificationPreferencesKeepalive,
} from "../api/client/notifications";
import {
    disableNativePushNotifications,
    enableNativePushNotifications,
    hasStoredNativeFcmToken,
    isNativePushEnvironment,
} from "../lib/androidPushNotifications";
import { CARGO_NOTIFICATION_STAGES, CARGO_STAGE_EVENT_IDS, isCargoStageNotificationEnabled, type CargoStageEventId } from "../../lib/notificationCargoEvents";
import { buildPushPreferencesSavePayload, isPushNotificationEnabled } from "../../lib/notificationEmailPrefs";
import { TapSwitch } from "../components/TapSwitch";

const NOTIF_DOCS: { id: string; label: string }[] = [
    { id: "bill_created", label: "Создан счёт" },
    { id: "bill_paid", label: "Счёт оплачен" },
];
const NOTIF_EXTRA: { id: string; label: string }[] = [
    { id: "planned_delivery_date", label: "Плановая дата доставки" },
    { id: "app_update", label: "Новая версия приложения" },
];
const NOTIF_SUMMARY: { id: string; label: string }[] = [
    { id: "daily_summary", label: "Ежедневная сводка в 10:00" },
];
const NOTIF_EMAIL_SUMMARY: { id: string; label: string }[] = [
    { id: "daily_summary", label: "Ежедневная сводка" },
    { id: "weekly_summary", label: "Еженедельная сводка (понедельник)" },
];

export function NotificationsPage({
    activeAccount,
    onBack,
    onOpenDeveloper,
}: {
    activeAccount: Account | null;
    activeAccountId?: string | null;
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

    const [prefs, setPrefs] = useState<{ push: Record<string, boolean>; email: Record<string, boolean> }>({
        push: {},
        email: {},
    });
    const [prefsLoading, setPrefsLoading] = useState(true);
    const [prefsSaving, setPrefsSaving] = useState(false);
    const [pushLoading, setPushLoading] = useState(false);
    const [pushError, setPushError] = useState<string | null>(null);
    const [pushEnabled, setPushEnabled] = useState(false);
    const prefsRef = useRef(prefs);
    const prefsDirtyRef = useRef(false);
    const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
    const pendingSavesRef = useRef(0);
    const lastSaveAtRef = useRef(0);
    const initialFetchStartedAtRef = useRef(0);

    const login = activeAccount?.login?.trim().toLowerCase() || "";
    const isNativePush = isNativePushEnvironment();

    const isCargoPrefEnabled = useCallback(
        (channel: "push" | "email", eventId: CargoStageEventId) =>
            isCargoStageNotificationEnabled(prefs[channel], eventId),
        [prefs],
    );

    const isPushCargoPrefEnabled = useCallback(
        (eventId: CargoStageEventId) => isCargoStageNotificationEnabled(prefs.push, eventId),
        [prefs.push],
    );

    const isPushPrefEnabled = useCallback(
        (eventId: string) => isPushNotificationEnabled(prefs.push, eventId),
        [prefs.push],
    );

    useEffect(() => {
        if (!login) {
            setPrefsLoading(false);
            setPushEnabled(false);
            return;
        }
        let cancelled = false;
        const fetchStartedAt = Date.now();
        initialFetchStartedAtRef.current = fetchStartedAt;
        const hardStop = setTimeout(() => {
            if (!cancelled) setPrefsLoading(false);
        }, FETCH_TIMEOUT_MS + 2000);
        (async () => {
            try {
                const prefsData = await withTimeout(
                    (signal) => fetchNotificationPreferences(login, signal),
                    FETCH_TIMEOUT_MS,
                ).catch(() => null);
                if (cancelled) return;
                if (prefsData) {
                    setPrefs((prev) => {
                        if (prefsDirtyRef.current) return prev;
                        if (lastSaveAtRef.current >= fetchStartedAt) return prev;
                        return {
                            push: prefsData.push || {},
                            email: prefsData.email || {},
                        };
                    });
                } else if (lastSaveAtRef.current < fetchStartedAt) {
                    setPrefs({ push: {}, email: {} });
                }
                if (isNativePush) {
                    const { PushNotifications } = await import("@capacitor/push-notifications");
                    const perm = await PushNotifications.checkPermissions();
                    // OS permission is not a backend registration. Showing "enabled" here
                    // made people tap Disable, which used to wipe the Android device.
                    if (!cancelled) {
                        setPushEnabled(perm.receive === "granted" && hasStoredNativeFcmToken(login));
                    }
                }
            } catch {
                if (!cancelled) setPrefs({ push: {}, email: {} });
            } finally {
                if (!cancelled) setPrefsLoading(false);
            }
        })();
        return () => {
            cancelled = true;
            clearTimeout(hardStop);
        };
    }, [login, isNativePush]);

    useEffect(() => {
        prefsRef.current = prefs;
    }, [prefs]);

    const persistPushCargoToggle = useCallback(async (eventId: CargoStageEventId, value: boolean) => {
        if (!login) return false;
        const res = await fetch("/api/push-preference-toggle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login, eventId, enabled: value }),
        });
        if (!res.ok) return false;
        try {
            const data = (await res.json()) as {
                push?: Record<string, boolean>;
                enabled?: boolean;
                eventId?: string;
            };
            if (data.push) {
                setPrefs((prev) => ({
                    ...prev,
                    push: { ...data.push, [eventId]: value },
                }));
                lastSaveAtRef.current = Date.now();
                prefsDirtyRef.current = false;
            }
        } catch {
            // keep optimistic local state
        }
        return true;
    }, [login]);

    const persistPrefs = useCallback(async (
        nextPrefs: { push: Record<string, boolean>; email: Record<string, boolean> },
        touch?: { channel: "push" | "email"; eventId: string; value: boolean },
    ) => {
        if (!login) return false;
        const payload = {
            push: touch?.channel === "push"
                ? buildPushPreferencesSavePayload(nextPrefs.push, { eventId: touch.eventId, value: touch.value })
                : nextPrefs.push,
            email: nextPrefs.email,
        };
        const res = await fetch("/api/webpush-preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                login,
                preferences: payload,
                pushToggle: touch?.channel === "push" ? { eventId: touch.eventId, enabled: touch.value } : undefined,
            }),
        });
        if (!res.ok) return false;
        try {
            const data = (await res.json()) as { preferences?: { push?: Record<string, boolean>; email?: Record<string, boolean> } };
            if (data.preferences?.push || data.preferences?.email) {
                const serverPush = data.preferences.push || nextPrefs.push;
                const serverEmail = data.preferences.email || nextPrefs.email;
                setPrefs({
                    push:
                        touch?.channel === "push"
                            ? { ...serverPush, [touch.eventId]: touch.value }
                            : serverPush,
                    email: serverEmail,
                });
                lastSaveAtRef.current = Date.now();
                prefsDirtyRef.current = false;
            }
        } catch {
            // keep optimistic local state
        }
        return true;
    }, [login]);

    const savePrefs = useCallback(
        async (channel: "push" | "email", eventId: string, value: boolean) => {
            let nextPrefs: { push: Record<string, boolean>; email: Record<string, boolean> } | null = null;
            setPrefs((prev) => {
                const next = {
                    ...prev,
                    [channel]: { ...prev[channel], [eventId]: value },
                };
                nextPrefs = next;
                return next;
            });
            if (!login || !nextPrefs) return;
            prefsDirtyRef.current = true;
            pendingSavesRef.current += 1;
            setPrefsSaving(true);
            saveQueueRef.current = saveQueueRef.current
                .catch(() => {})
                .then(async () => {
                    const ok =
                        channel === "push" && (CARGO_STAGE_EVENT_IDS as readonly string[]).includes(eventId)
                            ? await persistPushCargoToggle(eventId as CargoStageEventId, value)
                            : await persistPrefs(prefsRef.current, { channel, eventId, value });
                    if (!ok) throw new Error("save_failed");
                    prefsDirtyRef.current = false;
                })
                .catch(() => {
                    prefsDirtyRef.current = true;
                    setPushError("Не удалось сохранить настройки.");
                })
                .finally(() => {
                    pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
                    if (pendingSavesRef.current === 0) setPrefsSaving(false);
                });
        },
        [login, persistPrefs, persistPushCargoToggle],
    );

    const enablePush = useCallback(async () => {
        if (!login) return;
        setPushError(null);
        setPushLoading(true);
        try {
            const result = await enableNativePushNotifications(login);
            if (!result.ok) throw new Error(result.error || "Не удалось включить push.");
            setPushEnabled(true);
        } catch (e: unknown) {
            setPushError((e as { message?: string })?.message || "Не удалось включить push-уведомления.");
        } finally {
            setPushLoading(false);
        }
    }, [login]);

    const disablePush = useCallback(async () => {
        if (!login) return;
        setPushError(null);
        setPushLoading(true);
        try {
            const result = await disableNativePushNotifications(login);
            if (!result.ok) throw new Error(result.error || "Не удалось отключить push.");
            setPushEnabled(false);
        } catch (e: unknown) {
            setPushError((e as { message?: string })?.message || "Не удалось отключить push-уведомления.");
        } finally {
            setPushLoading(false);
        }
    }, [login]);

    const flushPrefsOnExit = useCallback(() => {
        if (!login || !prefsDirtyRef.current || pendingSavesRef.current > 0) return;
        void saveNotificationPreferencesKeepalive(login, {
            push: buildPushPreferencesSavePayload(prefsRef.current.push),
            email: prefsRef.current.email,
        }).then(() => {
            prefsDirtyRef.current = false;
        }).catch(() => {});
    }, [login]);

    useEffect(() => {
        return () => {
            flushPrefsOnExit();
        };
    }, [flushPrefsOnExit]);

    return (
        <div className="w-full" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}>
            <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={() => { flushPrefsOnExit(); onBack(); }} style={{ padding: "0.5rem" }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline className="text-page-title">Уведомления</Typography.Headline>
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
                        Push-уведомления
                    </Typography.Body>
                    <Panel className="cargo-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        {isNativePush ? (
                            <>
                                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                                    Уведомления о перевозках и документах на телефон через Firebase Cloud Messaging.
                                </Typography.Body>
                                {!pushEnabled ? (
                                    <Button type="button" className="button-primary" disabled={pushLoading} onClick={enablePush}>
                                        {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Включить push-уведомления"}
                                    </Button>
                                ) : (
                                    <>
                                        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-success, #22c55e)" }}>
                                            Push-уведомления включены.
                                        </Typography.Body>
                                        <Button type="button" className="button-secondary" disabled={pushLoading} onClick={disablePush}>
                                            {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Отключить push-уведомления"}
                                        </Button>
                                    </>
                                )}
                            </>
                        ) : (
                            <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                                Доставка push — в приложении HAULZ (Android или iOS). Здесь можно выбрать, о каких этапах перевозки присылать уведомления на телефон.
                            </Typography.Body>
                        )}
                        {pushError && (
                            <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }}>
                                {pushError}
                            </Typography.Body>
                        )}
                        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.25rem", marginBottom: "0.25rem" }}>
                            Раздел «Перевозки»
                        </Typography.Body>
                        {CARGO_NOTIFICATION_STAGES.map((ev) => (
                            <Flex key={`push-${ev.id}`} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                                <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                                <TapSwitch
                                    checked={isPushCargoPrefEnabled(ev.id)}
                                    onToggle={() => savePrefs("push", ev.id, !isPushCargoPrefEnabled(ev.id))}
                                    aria-label={`Push: ${ev.label}`}
                                />
                            </Flex>
                        ))}
                        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.5rem", marginBottom: "0.25rem" }}>
                            Раздел «Документы»
                        </Typography.Body>
                        {NOTIF_DOCS.map((ev) => (
                            <Flex key={`push-${ev.id}`} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                                <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                                <TapSwitch
                                    checked={isPushPrefEnabled(ev.id)}
                                    onToggle={() => savePrefs("push", ev.id, !isPushPrefEnabled(ev.id))}
                                    aria-label={`Push: ${ev.label}`}
                                />
                            </Flex>
                        ))}
                        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.5rem", marginBottom: "0.25rem" }}>
                            Прочее
                        </Typography.Body>
                        {NOTIF_EXTRA.map((ev) => (
                            <Flex key={`push-${ev.id}`} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                                <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                                <TapSwitch
                                    checked={isPushPrefEnabled(ev.id)}
                                    onToggle={() => savePrefs("push", ev.id, !isPushPrefEnabled(ev.id))}
                                    aria-label={`Push: ${ev.label}`}
                                />
                            </Flex>
                        ))}
                        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.5rem", marginBottom: "0.25rem" }}>
                            Сводка
                        </Typography.Body>
                        {NOTIF_SUMMARY.map((ev) => (
                            <Flex key={`push-${ev.id}`} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                                <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                                <TapSwitch
                                    checked={isPushPrefEnabled(ev.id)}
                                    onToggle={() => savePrefs("push", ev.id, !isPushPrefEnabled(ev.id))}
                                    aria-label={`Push: ${ev.label}`}
                                />
                            </Flex>
                        ))}
                        {prefsSaving && (
                            <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                                Сохранение…
                            </Typography.Body>
                        )}
                    </Panel>

                    <Typography.Body style={{ marginTop: "1.25rem", marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                        Email
                    </Typography.Body>
                    <Panel className="cargo-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                            Письма на адрес, указанный в профиле. Отключённые типы не отправляются, включая автоматическую еженедельную сводку.
                        </Typography.Body>
                        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>
                            Раздел «Перевозки»
                        </Typography.Body>
                        {CARGO_NOTIFICATION_STAGES.map((ev) => (
                            <Flex key={`email-${ev.id}`} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                                <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                                <TapSwitch
                                    checked={isCargoPrefEnabled("email", ev.id)}
                                    onToggle={() => savePrefs("email", ev.id, !isCargoPrefEnabled("email", ev.id))}
                                    aria-label={`Email: ${ev.label}`}
                                />
                            </Flex>
                        ))}
                        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.5rem", marginBottom: "0.25rem" }}>
                            Раздел «Документы»
                        </Typography.Body>
                        {NOTIF_DOCS.map((ev) => (
                            <Flex key={`email-${ev.id}`} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                                <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                                <TapSwitch
                                    checked={!!prefs.email[ev.id]}
                                    onToggle={() => savePrefs("email", ev.id, !prefs.email[ev.id])}
                                    aria-label={`Email: ${ev.label}`}
                                />
                            </Flex>
                        ))}
                        <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.5rem", marginBottom: "0.25rem" }}>
                            Сводка
                        </Typography.Body>
                        {NOTIF_EMAIL_SUMMARY.map((ev) => (
                            <Flex key={`email-${ev.id}`} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                                <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                                <TapSwitch
                                    checked={!!prefs.email[ev.id]}
                                    onToggle={() => savePrefs("email", ev.id, !prefs.email[ev.id])}
                                    aria-label={`Email: ${ev.label}`}
                                />
                            </Flex>
                        ))}
                        {prefsSaving && (
                            <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                                Сохранение…
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

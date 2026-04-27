import React, { useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../../types";

type Props = {
    activeAccount: Account | null;
    onBack: () => void;
};

/** Экран «Голосовые помощники»: привязка навыка Яндекс Алисы (код / отвязка). */
export function ProfileVoiceAssistantsSection({ activeAccount, onBack }: Props) {
    const [aliceCode, setAliceCode] = useState<string | null>(null);
    const [aliceExpiresAt, setAliceExpiresAt] = useState<number | null>(null);
    const [aliceLoading, setAliceLoading] = useState(false);
    const [aliceError, setAliceError] = useState<string | null>(null);
    const [aliceSuccess, setAliceSuccess] = useState<string | null>(null);

    const serviceModeAllowed = !!activeAccount?.isRegisteredUser && activeAccount?.permissions?.service_mode === true;

    if (!serviceModeAllowed) {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                    <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: "1.25rem" }}>Голосовые помощники</Typography.Headline>
                </Flex>
                <Panel className="cargo-card" style={{ padding: "1rem" }}>
                    <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
                        Доступно только при включённом служебном режиме.
                    </Typography.Body>
                </Panel>
            </div>
        );
    }

    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: "1.25rem" }}>Голосовые помощники</Typography.Headline>
            </Flex>
            <Typography.Body style={{ marginBottom: "0.75rem", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Алиса</Typography.Body>
            <Panel className="cargo-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <Typography.Body style={{ fontSize: "0.9rem" }}>
                    Скажите Алисе: «Запусти навык Холз» и назовите код ниже. После привязки Алиса подтвердит компанию. Голосом можно узнавать перевозки в пути, счета на оплату, краткий статус «что в работе», сводку за день или за период, статус по номеру перевозки; при ответе «подробнее» Алиса скажет «Написал в чат» и отправит таблицу в чат мини‑приложения (номер / дата / кол-во / плат вес / сумма). Номера перевозок произносятся по три цифры (135200 — «сто тридцать пять двести»). Если привязано несколько компаний — можно переключиться голосом или отвязать навык фразой «Отвяжи компанию».
                </Typography.Body>
                <Button
                    className="button-primary"
                    type="button"
                    disabled={!activeAccount?.login || !activeAccount?.password || aliceLoading}
                    onClick={async () => {
                        if (!activeAccount?.login || !activeAccount?.password) return;
                        try {
                            setAliceError(null);
                            setAliceSuccess(null);
                            setAliceLoading(true);
                            const res = await fetch("/api/alice-link", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    login: activeAccount.login,
                                    password: activeAccount.password,
                                    customer: activeAccount.customer || null,
                                    inn: activeAccount.activeCustomerInn ?? undefined,
                                }),
                            });
                            if (!res.ok) {
                                const err = await res.json().catch(() => ({}));
                                throw new Error(err?.error || "Не удалось получить код");
                            }
                            const data = await res.json();
                            setAliceCode(String(data?.code || ""));
                            setAliceExpiresAt(Date.now() + Number(data?.ttl || 0) * 1000);
                        } catch (e: unknown) {
                            setAliceError((e as Error)?.message || "Не удалось получить код");
                        } finally {
                            setAliceLoading(false);
                        }
                    }}
                >
                    {aliceLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "Получить код для Алисы"}
                </Button>
                {aliceCode && (
                    <Typography.Body style={{ fontSize: "0.9rem", fontWeight: 600 }}>Код: {aliceCode}</Typography.Body>
                )}
                {aliceExpiresAt && (
                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                        Код действует до{" "}
                        {new Date(aliceExpiresAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                    </Typography.Body>
                )}
                {aliceError && (
                    <Flex align="center" className="login-error">
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        <Typography.Body style={{ fontSize: "0.85rem" }}>{aliceError}</Typography.Body>
                    </Flex>
                )}
                {aliceSuccess && (
                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-success, #22c55e)" }}>{aliceSuccess}</Typography.Body>
                )}
                <Typography.Body style={{ marginTop: "0.75rem", fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                    Чтобы отключить навык от аккаунта, нажмите кнопку ниже.
                </Typography.Body>
                <Button
                    className="filter-button"
                    type="button"
                    disabled={!activeAccount?.login}
                    onClick={async () => {
                        if (!activeAccount?.login) return;
                        try {
                            setAliceError(null);
                            setAliceSuccess(null);
                            const res = await fetch("/api/alice-unlink", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ login: activeAccount.login.trim().toLowerCase() }),
                            });
                            const data = await res.json().catch(() => ({}));
                            if (res.ok && data?.ok) {
                                setAliceCode(null);
                                setAliceExpiresAt(null);
                                setAliceSuccess(data?.message || "Алиса отвязана от аккаунта.");
                            } else {
                                setAliceError(data?.error || "Не удалось отвязать.");
                            }
                        } catch (e: unknown) {
                            setAliceError((e as Error)?.message || "Ошибка сети.");
                        }
                    }}
                    style={{ marginTop: "0.25rem" }}
                >
                    Отвязать от Алисы
                </Button>
            </Panel>

            <Typography.Body style={{ marginTop: "1.25rem", marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                Описание навыков
            </Typography.Body>
            <Panel className="cargo-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                    «Запусти навык Холз» → назовите код из приложения → Алиса подтвердит компанию. Ниже — фразы и сценарии.
                </Typography.Body>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <Typography.Body style={{ fontSize: "0.8rem", fontWeight: 600 }}>Перевозки и оплаты</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.8rem" }}>
                        • «Какие перевозки в пути?» — кратко номера (по три цифры). «Подробнее» — Алиса скажет «Написал в чат» и отправит таблицу в чат (номер / дата / кол-во / плат вес / сумма).
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.8rem" }}>
                        • «Какие счета на оплату?» — то же: кратко, по «подробнее» — таблица в чат.
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.8rem" }}>
                        • «Что в работе?» / «Что у меня в работе?» — одна фраза: в пути N перевозок, к оплате M.
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.8rem" }}>
                        • «Сводка за день» / «Сводка за сегодня» / «Сводка на сегодня» — ответ принято, в пути, на доставке, доставлено, счета на оплату (кол-во и сумма).
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.8rem" }}>
                        • «Сколько перевозок за сегодня?» / «на этой неделе?» / «за неделю?» — число перевозок за период.
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.8rem" }}>
                        • «Статус перевозки 135702» / «Консолидация 135702» / «Груз 135702» — детали по одной перевозке.
                    </Typography.Body>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <Typography.Body style={{ fontSize: "0.8rem", fontWeight: 600 }}>Управление</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.8rem" }}>
                        • «Работай от имени компании [название]» / «Переключись на компанию [название]» — переключить компанию (если привязано несколько).
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.8rem" }}>
                        • «Отвяжи компанию» / «Отвяжи заказчика» / «Отвяжи» — отвязать навык; новый код — в приложении.
                    </Typography.Body>
                </div>
                <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                    Другие вопросы (контакты, груз по номеру) Алиса передаёт в чат поддержки с контекстом вашей компании.
                </Typography.Body>
            </Panel>
        </div>
    );
}

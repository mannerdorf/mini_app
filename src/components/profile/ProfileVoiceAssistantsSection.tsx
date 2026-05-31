import React, { useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../../types";
import { VOICE_ASSISTANT_GUIDE_SECTIONS } from "../../pages/profile/voiceAssistantGuideContent";

type Props = {
    activeAccount: Account | null;
    onBack: () => void;
};

/** Экран «Голосовые помощники»: привязка навыка Яндекс Алисы (код / отвязка). Только служебный режим. */
export function ProfileVoiceAssistantsSection({ activeAccount, onBack }: Props) {
    const voiceUnlocked =
        activeAccount?.isRegisteredUser === true && activeAccount?.permissions?.service_mode === true;
    const [aliceCode, setAliceCode] = useState<string | null>(null);
    const [aliceExpiresAt, setAliceExpiresAt] = useState<number | null>(null);
    const [aliceLoading, setAliceLoading] = useState(false);
    const [aliceError, setAliceError] = useState<string | null>(null);
    const [aliceSuccess, setAliceSuccess] = useState<string | null>(null);

    if (!voiceUnlocked) {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                    <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline className="text-page-title">Голосовые помощники</Typography.Headline>
                </Flex>
                <Panel className="cargo-card" style={{ padding: "1rem" }}>
                    <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                        Голосовой помощник пока доступен только пользователям со служебным режимом. Обратитесь к
                        администратору HAULZ, если вам нужен доступ.
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
                <Typography.Headline className="text-page-title">Голосовые помощники</Typography.Headline>
            </Flex>
            <Typography.Body style={{ marginBottom: "0.75rem", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Алиса</Typography.Body>
            <Panel className="cargo-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <Typography.Body style={{ fontSize: "0.9rem" }}>
                    Получите код ниже и назовите его Алисе после фразы «Запусти навык Холз». Подробная инструкция — в блоках ниже.
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
                Инструкция
            </Typography.Body>
            <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
                Как подключить навык и что спрашивать у Грузика.
            </Typography.Body>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {VOICE_ASSISTANT_GUIDE_SECTIONS.map((section) => (
                    <Panel
                        key={section.id}
                        className="cargo-card"
                        style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}
                    >
                        <Typography.Body style={{ fontSize: "0.9rem", fontWeight: 600 }}>{section.title}</Typography.Body>
                        {section.intro && (
                            <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                                {section.intro}
                            </Typography.Body>
                        )}
                        {section.steps && section.steps.length > 0 && (
                            <ol style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                                {section.steps.map((step, idx) => (
                                    <li key={idx}>
                                        <Typography.Body style={{ fontSize: "0.85rem" }}>{step}</Typography.Body>
                                    </li>
                                ))}
                            </ol>
                        )}
                        {section.items && section.items.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                {section.items.map((item) => (
                                    <div key={item.label}>
                                        <Typography.Body style={{ fontSize: "0.8rem", fontWeight: 600 }}>{item.label}</Typography.Body>
                                        <Typography.Body style={{ fontSize: "0.8rem" }}>{item.phrases}</Typography.Body>
                                        {item.hint && (
                                            <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                                                {item.hint}
                                            </Typography.Body>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {section.bullets && section.bullets.length > 0 && (
                            <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                                {section.bullets.map((bullet, idx) => (
                                    <li key={idx}>
                                        <Typography.Body style={{ fontSize: "0.85rem" }}>{bullet}</Typography.Body>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {section.footnote && (
                            <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.25rem" }}>
                                {section.footnote}
                            </Typography.Body>
                        )}
                    </Panel>
                ))}
            </div>
        </div>
    );
}

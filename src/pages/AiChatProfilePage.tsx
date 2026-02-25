import React, { useState, useRef, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import type { AuthData } from "../types";
import { stripOoo } from "../lib/formatUtils";
import { ChatPage } from "./ChatPage";

export function AiChatProfilePage({
    onBack,
    auth,
    accountId,
    customer,
    onOpenCargo,
    chatId,
    onOpenTelegramBot,
    onOpenMaxBot,
}: {
    onBack: () => void;
    auth: AuthData | null;
    accountId: string | null;
    customer: string | null;
    onOpenCargo: (cargoNumber: string) => void;
    chatId: string | null;
    onOpenTelegramBot?: () => Promise<void>;
    onOpenMaxBot?: () => Promise<void>;
}) {
    const [prefillMessage, setPrefillMessage] = useState<string | undefined>(undefined);
    const [tgLinkError, setTgLinkError] = useState<string | null>(null);
    const [chatCustomerState, setChatCustomerState] = useState<{ customer: string | null; unlinked: boolean }>({
        customer: customer ?? null,
        unlinked: false,
    });
    const chatClearRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const stored = window.sessionStorage.getItem("haulz.chat.prefill");
        if (stored) {
            setPrefillMessage(stored);
            window.sessionStorage.removeItem("haulz.chat.prefill");
        }
    }, []);

    return (
        <div
            className="w-full"
            style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 240px)" }}
        >
            <Flex align="center" style={{ marginBottom: "0.5rem", gap: "0.75rem", flexWrap: "wrap" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Button
                    className="filter-button"
                    style={{ marginLeft: "auto" }}
                    onClick={() => chatClearRef.current?.()}
                >
                    Очистить чат
                </Button>
                {onOpenTelegramBot && (
                    <img
                        src="/icons/telegram.png"
                        alt="Открыть в Telegram"
                        role="button"
                        title="Открыть в Telegram"
                        tabIndex={0}
                        onClick={async () => {
                            setTgLinkError(null);
                            try {
                                await onOpenTelegramBot();
                            } catch (e: unknown) {
                                setTgLinkError((e as { message?: string })?.message || "Не удалось открыть Telegram-бота.");
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                (e.target as HTMLImageElement).click();
                            }
                        }}
                        className="chat-icon-btn"
                    />
                )}
                {onOpenMaxBot && (
                    <img
                        src="/icons/max.png"
                        alt="Открыть в MAX"
                        role="button"
                        title="Открыть в MAX"
                        tabIndex={0}
                        onClick={async () => {
                            setTgLinkError(null);
                            try {
                                await onOpenMaxBot();
                            } catch (e: unknown) {
                                setTgLinkError((e as { message?: string })?.message || "Не удалось открыть MAX.");
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                (e.target as HTMLImageElement).click();
                            }
                        }}
                        className="chat-icon-btn"
                    />
                )}
            </Flex>
            <div style={{ marginBottom: "1rem", paddingLeft: "0.25rem" }}>
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                    Заказчик:{" "}
                    {chatCustomerState.unlinked || !chatCustomerState.customer
                        ? "не привязан"
                        : stripOoo(chatCustomerState.customer)}
                </Typography.Body>
            </div>
            {tgLinkError && (
                <Typography.Body style={{ color: "var(--color-error-text)", marginBottom: "0.5rem" }}>
                    {tgLinkError}
                </Typography.Body>
            )}
            <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                {auth ? (
                    <ChatPage
                        auth={auth}
                        sessionOverride={`ai_${customer || accountId || "anon"}_${chatId || "anon"}`}
                        userIdOverride={chatId || customer || accountId || "anon"}
                        customerOverride={customer || undefined}
                        prefillMessage={prefillMessage}
                        onClearPrefill={() => setPrefillMessage(undefined)}
                        onOpenCargo={onOpenCargo}
                        clearChatRef={chatClearRef}
                        onChatCustomerState={setChatCustomerState}
                    />
                ) : (
                    <Panel className="cargo-card" style={{ padding: "1rem", width: "100%" }}>
                        <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                            Сначала выберите компанию.
                        </Typography.Body>
                    </Panel>
                )}
            </div>
        </div>
    );
}

import React, { useState } from "react";
import { ArrowLeft, AlertTriangle, Loader2 } from "lucide-react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import { getWebApp, isMaxWebApp } from "../webApp";

function truncateForLog(u: string, max = 80) {
    return u.length <= max ? u : u.slice(0, max) + "...";
}

export function TinyUrlTestPage({ onBack }: { onBack: () => void }) {
    const [inputUrl, setInputUrl] = useState("");
    const [shortUrl, setShortUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [maxDebugInfo, setMaxDebugInfo] = useState<string>("");

    const testMaxMessage = async () => {
        const webApp = getWebApp();
        const testLogs: string[] = [];

        testLogs.push(`Time: ${new Date().toISOString()}`);
        testLogs.push(`Environment: ${isMaxWebApp() ? "MAX" : "Not MAX"}`);
        testLogs.push(`window.WebApp: ${!!(window as unknown as { WebApp?: unknown }).WebApp}`);
        testLogs.push(`URL: ${window.location.href}`);

        if (webApp) {
            if (typeof webApp.ready === "function") {
                try {
                    webApp.ready();
                    testLogs.push("Called webApp.ready()");
                } catch (e) {
                    testLogs.push(`ready() error: ${e}`);
                }
            }

            testLogs.push(`initData Type: ${typeof webApp.initData}`);
            if (webApp.initData) {
                testLogs.push(`initData Length: ${webApp.initData.length}`);
                testLogs.push(`initData Value: ${webApp.initData.substring(0, 100)}`);
            } else {
                testLogs.push("initData is EMPTY string or null");
            }

            const unsafe = webApp.initDataUnsafe || {};
            const unsafeKeys = Object.keys(unsafe);
            testLogs.push(`initDataUnsafe Keys (${unsafeKeys.length}): ${unsafeKeys.join(", ")}`);

            if (unsafe.user) testLogs.push(`user: ${JSON.stringify(unsafe.user)}`);
            if (unsafe.chat) testLogs.push(`chat: ${JSON.stringify(unsafe.chat)}`);

            testLogs.push("--- Searching Global Scope ---");
            const globals = Object.keys(window).filter(
                (k) =>
                    (k.toLowerCase().includes("id") || k.toLowerCase().includes("user") || k.toLowerCase().includes("chat")) &&
                    !k.startsWith("webkit") &&
                    !k.startsWith("on") &&
                    k !== "id"
            );
            testLogs.push(`Global matches: ${globals.slice(0, 10).join(", ")}`);
            globals.slice(0, 5).forEach((k) => {
                try {
                    const val = (window as unknown as Record<string, unknown>)[k];
                    if (typeof val !== "function" && typeof val !== "object") {
                        testLogs.push(`${k}: ${val}`);
                    }
                } catch {
                    /* ignore */
                }
            });

            if (typeof window !== "undefined" && (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp) {
                testLogs.push(
                    `Telegram.WebApp.initData: ${(window as unknown as { Telegram: { WebApp: { initData?: string } } }).Telegram.WebApp.initData ? "YES" : "NO"}`
                );
            }

            const w = window as unknown as { WebAppUser?: { id?: string }; userId?: string };
            const chatId =
                unsafe.user?.id ||
                unsafe.chat?.id ||
                w.WebAppUser?.id ||
                w.userId;
            testLogs.push(`Detected chatId from unsafe: ${chatId}`);

            let manualChatId: string | number | null = null;
            try {
                const hash = window.location.hash;
                if (hash.includes("WebAppData=")) {
                    const data = decodeURIComponent(hash.split("WebAppData=")[1].split("&")[0]);
                    const params = new URLSearchParams(data);
                    const chatStr = params.get("chat");
                    if (chatStr) {
                        const chatObj = JSON.parse(chatStr) as { id?: string };
                        manualChatId = chatObj.id ?? null;
                        testLogs.push(`Manual parse chatId (chat): ${manualChatId}`);
                    }
                    if (!manualChatId) {
                        const userStr = params.get("user");
                        if (userStr) {
                            const userObj = JSON.parse(userStr) as { id?: string };
                            manualChatId = userObj.id ?? null;
                            testLogs.push(`Manual parse chatId (user): ${manualChatId}`);
                        }
                    }
                }
            } catch (e) {
                testLogs.push(`Manual parse error: ${e}`);
            }

            const finalId = chatId || manualChatId;
            testLogs.push(`Final Detected chatId: ${finalId}`);

            if (finalId) {
                try {
                    testLogs.push("Sending test message...");
                    const res = await fetch("/api/max-send-message", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            chatId: finalId,
                            text: `🛠 ТЕСТ ИЗ ПРОФИЛЯ\nChatID: ${finalId}\nTime: ${new Date().toLocaleTimeString()}`,
                        }),
                    });
                    const resStatus = res.status;
                    const resText = await res.text();
                    testLogs.push(`Response status: ${resStatus}`);

                    try {
                        const resData = JSON.parse(resText) as Record<string, unknown>;
                        if (resStatus !== 200) {
                            testLogs.push(`Error Data: ${JSON.stringify(resData)}`);
                        } else {
                            testLogs.push("✅ Message sent successfully!");
                        }
                    } catch {
                        testLogs.push(`Raw Response (not JSON): ${resText.substring(0, 200)}`);
                    }
                } catch (e: unknown) {
                    testLogs.push(`Fetch Error: ${(e as { message?: string })?.message}`);
                }
            }
        }

        setMaxDebugInfo(testLogs.join("\n"));
    };

    const addLog = (message: string) => {
        const timestamp = new Date().toLocaleTimeString("ru-RU");
        setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
    };

    const handlePing = async () => {
        setError(null);
        addLog("Проверка GET /api/shorten-ping...");
        try {
            const res = await fetch("/api/shorten-ping", { method: "GET" });
            const data = (await res.json().catch(() => ({}))) as { tinyurl_configured?: boolean };
            addLog(`GET ответ: status=${res.status}, ok=${res.ok}`);
            addLog(`tinyurl_configured: ${data.tinyurl_configured === true ? "ДА" : "НЕТ"}`);
            if (data.tinyurl_configured) addLog("✅ Токен TinyURL задан. Можно пробовать сокращать.");
            else addLog("❌ TINYURL_API_TOKEN не задан в Vercel.");
        } catch (e: unknown) {
            addLog(`❌ Ошибка: ${(e as { message?: string })?.message || String(e)}`);
        }
    };

    const handleShorten = async () => {
        if (!inputUrl.trim()) {
            setError("Введите URL");
            return;
        }
        try {
            new URL(inputUrl);
        } catch {
            setError("Неверный формат URL");
            return;
        }

        setLoading(true);
        setError(null);
        setShortUrl(null);
        addLog(`Начало сокращения URL: ${truncateForLog(inputUrl)}`);

        try {
            addLog("Клиент → POST /api/shorten");
            addLog(`Тело запроса: {"url":"${truncateForLog(inputUrl)}"} (длина: ${inputUrl.length})`);

            const res = await fetch("/api/shorten", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: inputUrl }),
            });

            const raw = await res.text();
            addLog(`Ответ: status=${res.status}, ok=${res.ok}`);

            if (res.ok) {
                let data: { short_url?: string; message?: string } = {};
                try {
                    data = JSON.parse(raw);
                } catch {
                    data = { message: raw };
                }
                if (data.short_url) {
                    setShortUrl(data.short_url);
                    addLog(`✅ Успешно! Короткая ссылка: ${data.short_url}`);
                } else {
                    setError("Короткая ссылка не получена");
                    addLog("❌ В ответе нет short_url");
                }
            } else {
                let errData: { message?: string; error?: string } = {};
                try {
                    errData = JSON.parse(raw);
                } catch {
                    errData = { message: raw };
                }
                if (raw.includes("FUNCTION_INVOCATION_FAILED")) {
                    addLog("Сервер упал до ответа. Детали — в логах Vercel (Functions → /api/shorten).");
                }
                setError(errData.message || errData.error || raw || `Ошибка ${res.status}`);
                addLog(`❌ Ошибка: ${errData.error || errData.message || raw}`);
            }
        } catch (e: unknown) {
            const msg = (e as { message?: string })?.message || String(e);
            addLog(`❌ Исключение: ${msg}`);
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: "1.25rem" }}>Тест TinyURL</Typography.Headline>
            </Flex>

            <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                <Typography.Label style={{ marginBottom: "0.5rem", display: "block" }}>
                    Введите длинную ссылку:
                </Typography.Label>
                <Input
                    type="url"
                    placeholder="https://example.com/very/long/url..."
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    className="login-input"
                    style={{ marginBottom: "0.75rem" }}
                    disabled={loading}
                />
                <Flex style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                    <Button
                        className="filter-button"
                        onClick={handlePing}
                        disabled={loading}
                        style={{ flex: 1, minWidth: "140px" }}
                    >
                        Проверить подключение
                    </Button>
                    <Button
                        className="button-primary"
                        onClick={handleShorten}
                        disabled={loading || !inputUrl.trim()}
                        style={{ flex: 1, minWidth: "140px" }}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Сокращаю...
                            </>
                        ) : (
                            "Сократить ссылку"
                        )}
                    </Button>
                </Flex>

                {error && (
                    <Flex align="center" className="login-error mt-4">
                        <AlertTriangle className="w-5 h-5 mr-2" />
                        <Typography.Body>{error}</Typography.Body>
                    </Flex>
                )}

                {shortUrl && (
                    <div
                        style={{
                            marginTop: "1rem",
                            padding: "0.75rem",
                            background: "var(--color-bg-secondary)",
                            borderRadius: "0.5rem",
                        }}
                    >
                        <Typography.Label style={{ marginBottom: "0.5rem", display: "block" }}>
                            Короткая ссылка:
                        </Typography.Label>
                        <Typography.Body
                            style={{
                                wordBreak: "break-all",
                                color: "var(--color-primary)",
                                cursor: "pointer",
                            }}
                            onClick={() => {
                                navigator.clipboard?.writeText(shortUrl).then(() => {
                                    alert("Скопировано!");
                                });
                            }}
                        >
                            {shortUrl}
                        </Typography.Body>
                    </div>
                )}
            </Panel>

            {isMaxWebApp() && (
                <Panel
                    className="cargo-card mb-4"
                    style={{
                        padding: "1rem",
                        background: "#222",
                        color: "#fff",
                        border: "1px dashed #555",
                        marginTop: "1rem",
                    }}
                >
                    <Typography.Headline style={{ fontSize: "1rem", marginBottom: "0.5rem", color: "#ffcc00" }}>
                        🛠 MAX Debug (Profile Section)
                    </Typography.Headline>
                    <Flex vertical gap="0.75rem">
                        <Button
                            onClick={testMaxMessage}
                            className="filter-button"
                            style={{ background: "#ffcc00", color: "#000", fontWeight: "bold" }}
                        >
                            Отправить тестовое сообщение
                        </Button>
                        {maxDebugInfo && (
                            <pre
                                style={{
                                    background: "#000",
                                    padding: "0.75rem",
                                    borderRadius: "8px",
                                    fontSize: "0.75rem",
                                    overflowX: "auto",
                                    whiteSpace: "pre-wrap",
                                    border: "1px solid #333",
                                }}
                            >
                                {maxDebugInfo}
                            </pre>
                        )}
                    </Flex>
                </Panel>
            )}

            <Panel className="cargo-card" style={{ padding: "1rem" }}>
                <Typography.Label style={{ marginBottom: "0.75rem", display: "block" }}>
                    Логи:
                </Typography.Label>
                <div
                    style={{
                        maxHeight: "400px",
                        overflowY: "auto",
                        background: "var(--color-bg-secondary)",
                        padding: "0.75rem",
                        borderRadius: "0.5rem",
                        fontSize: "0.85rem",
                        fontFamily: "monospace",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                    }}
                >
                    {logs.length === 0 ? (
                        <Typography.Body style={{ color: "var(--color-text-secondary)" }}>
                            Логи появятся здесь после попытки сокращения ссылки...
                        </Typography.Body>
                    ) : (
                        logs.map((log, idx) => (
                            <div key={idx} style={{ marginBottom: "0.25rem" }}>
                                {log}
                            </div>
                        ))
                    )}
                </div>
                {logs.length > 0 && (
                    <Button
                        className="filter-button"
                        onClick={() => setLogs([])}
                        style={{ marginTop: "0.75rem", width: "100%" }}
                    >
                        Очистить логи
                    </Button>
                )}
            </Panel>
        </div>
    );
}

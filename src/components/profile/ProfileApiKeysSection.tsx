import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, Key, Loader2, Plus, Trash2 } from "lucide-react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../../types";
import { USER_API_KEY_SCOPES_CLIENT, USER_API_KEY_SCOPE_INFO_RU, scopeTitleRu } from "../../constants/userApiKeyScopesClient";
import { ProfileApiCatalogPostman } from "./ProfileApiCatalogPostman";

type ApiKeyRow = {
    id: string;
    label: string;
    key_hint: string;
    /** Префикс до секрета — безопасно копировать (см. GET /api/my-api-keys). */
    key_prefix?: string;
    scopes: string[];
    allowed_inns: string[];
    created_at: string;
    last_used_at: string | null;
};

type Props = {
    activeAccount: Account | null;
    onBack: () => void;
};

export function ProfileApiKeysSection({ activeAccount, onBack }: Props) {
    const [keys, setKeys] = useState<ApiKeyRow[]>([]);
    const [assignableInns, setAssignableInns] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [newLabel, setNewLabel] = useState("");
    const [scopesSel, setScopesSel] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(USER_API_KEY_SCOPES_CLIENT.map((s) => [s, true])),
    );
    const [innChecks, setInnChecks] = useState<Record<string, boolean>>({});
    const [commaInns, setCommaInns] = useState("");
    const [newToken, setNewToken] = useState<string | null>(null);
    const [catalogOpen, setCatalogOpen] = useState(false);
    const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

    const login = activeAccount?.login?.trim() || "";
    const password = activeAccount?.password || "";
    const accessAllInns = activeAccount?.accessAllInns === true;

    const load = useCallback(async () => {
        if (!login || !password) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/my-api-keys", {
                method: "GET",
                headers: { "x-login": login, "x-password": password },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((data?.error as string) || "Ошибка загрузки");
            setKeys(Array.isArray(data.keys) ? data.keys : []);
            const ai = Array.isArray(data.assignable_inns) ? data.assignable_inns.map((x: string) => String(x)) : [];
            setAssignableInns(ai);
            const next: Record<string, boolean> = {};
            for (const inn of ai) next[inn] = false;
            setInnChecks(next);
        } catch (e: unknown) {
            setError((e as Error)?.message || "Ошибка загрузки");
        } finally {
            setLoading(false);
        }
    }, [login, password]);

    useEffect(() => {
        void load();
    }, [load]);

    const selectedScopesList = useMemo(
        () => USER_API_KEY_SCOPES_CLIENT.filter((s) => scopesSel[s]),
        [scopesSel],
    );

    const buildAllowedInnsPayload = (): string[] => {
        if (assignableInns.length > 0) {
            return assignableInns.filter((inn) => innChecks[inn]);
        }
        if (accessAllInns) {
            return commaInns
                .split(/[\s,;]+/)
                .map((x) => x.replace(/\D/g, "").trim())
                .filter(Boolean);
        }
        return [];
    };

    const handleCreate = async () => {
        if (!login || !password) return;
        if (selectedScopesList.length === 0) {
            setError("Выберите хотя бы один scope");
            return;
        }
        const allowed = buildAllowedInnsPayload();
        setCreating(true);
        setError(null);
        setNewToken(null);
        try {
            const res = await fetch("/api/my-api-keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    login,
                    password,
                    label: newLabel.trim() || "API key",
                    scopes: selectedScopesList,
                    allowed_inns: allowed,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((data?.error as string) || "Не удалось создать ключ");
            if (typeof data.token === "string") setNewToken(data.token);
            setNewLabel("");
            await load();
        } catch (e: unknown) {
            setError((e as Error)?.message || "Ошибка создания");
        } finally {
            setCreating(false);
        }
    };

    const copyKeySnippet = useCallback((keyId: string, text: string) => {
        void navigator.clipboard?.writeText(text).catch(() => {});
        setCopiedKeyId(keyId);
        window.setTimeout(() => setCopiedKeyId((cur) => (cur === keyId ? null : cur)), 1600);
    }, []);

    const handleRevoke = async (id: string) => {
        if (!login || !password) return;
        if (!confirm("Отозвать этот ключ? Запросы с ним перестанут работать.")) return;
        setError(null);
        try {
            const res = await fetch(`/api/my-api-keys?id=${encodeURIComponent(id)}`, {
                method: "DELETE",
                headers: { "x-login": login, "x-password": password },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((data?.error as string) || "Не удалось отозвать");
            await load();
        } catch (e: unknown) {
            setError((e as Error)?.message || "Ошибка");
        }
    };

    if (!activeAccount?.isRegisteredUser) {
        return (
            <div className="w-full profile-api-keys-root">
                <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                    <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: "1.25rem" }}>API</Typography.Headline>
                </Flex>
                <Panel className="cargo-card" style={{ padding: "1rem" }}>
                    <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                        API-ключи доступны только для зарегистрированных аккаунтов (вход по email и паролю в приложении).
                    </Typography.Body>
                </Panel>
            </div>
        );
    }

    return (
        <div className="w-full profile-api-keys-root">
            <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: "1.25rem" }}>API</Typography.Headline>
            </Flex>

            <Typography.Body style={{ marginBottom: "0.75rem", color: "var(--color-text-secondary)", fontSize: "0.9rem" }}>
                Создавайте ключи с правами (scopes) и ограничением по ИНН. Запросы к бэкенду:{" "}
                <Typography.Body as="span" style={{ fontWeight: 600 }}>
                    Authorization: Bearer &lt;токен&gt;
                </Typography.Body>
                , например POST <code>/api/partner/v1/cargo</code> с тем же телом, что и для <code>/api/perevozki</code> (без логина/пароля в теле
                для режима ключа).
            </Typography.Body>

            {error ? (
                <Panel className="cargo-card" style={{ padding: "0.75rem", marginBottom: "0.75rem", border: "1px solid rgba(239,68,68,0.35)" }}>
                    <Typography.Body style={{ fontSize: "0.85rem", color: "#ef4444" }}>{error}</Typography.Body>
                </Panel>
            ) : null}

            {newToken ? (
                <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "0.75rem", background: "rgba(16,185,129,0.08)" }}>
                    <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Сохраните токен</Typography.Body>
                    <Typography.Body style={{ fontSize: "0.8rem", marginBottom: "0.5rem", wordBreak: "break-all", fontFamily: "monospace" }}>
                        {newToken}
                    </Typography.Body>
                    <Button size="sm" variant="secondary" onClick={() => setNewToken(null)}>
                        Скрыть
                    </Button>
                </Panel>
            ) : null}

            <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "0.75rem" }} onClick={(e) => e.stopPropagation()}>
                <Flex align="center" style={{ gap: "0.5rem", marginBottom: "0.75rem" }}>
                    <Key className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
                    <Typography.Body style={{ fontWeight: 600 }}>Новый ключ</Typography.Body>
                </Flex>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                    <div>
                        <Typography.Body style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}>Название</Typography.Body>
                        <Input
                            className="login-input"
                            style={{ width: "100%" }}
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            placeholder="Например, интеграция 1С"
                        />
                    </div>
                    <div>
                        <Typography.Body style={{ fontSize: "0.8rem", marginBottom: "0.25rem", fontWeight: 600 }}>
                            Права доступа
                        </Typography.Body>
                        <Typography.Body
                            style={{
                                fontSize: "0.75rem",
                                color: "var(--color-text-secondary)",
                                marginBottom: "0.5rem",
                                lineHeight: 1.45,
                            }}
                        >
                            Отметьте, что разрешено делать с этим ключом. В запросе указывайте заголовок{" "}
                            <Typography.Body as="span" style={{ fontFamily: "monospace", fontSize: "0.72rem" }}>
                                Authorization: Bearer …
                            </Typography.Body>
                            .
                        </Typography.Body>
                        <Flex direction="column" style={{ gap: "0.65rem" }}>
                            {USER_API_KEY_SCOPES_CLIENT.map((s) => {
                                const info = USER_API_KEY_SCOPE_INFO_RU[s];
                                return (
                                    <label
                                        key={s}
                                        style={{
                                            display: "flex",
                                            alignItems: "flex-start",
                                            gap: "0.6rem",
                                            fontSize: "0.85rem",
                                            cursor: "pointer",
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={!!scopesSel[s]}
                                            onChange={() => setScopesSel((prev) => ({ ...prev, [s]: !prev[s] }))}
                                            style={{ marginTop: "0.2rem" }}
                                        />
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <Typography.Body style={{ fontWeight: 600, fontSize: "0.85rem", display: "block" }}>
                                                {info.title}
                                            </Typography.Body>
                                            <Typography.Body
                                                style={{
                                                    fontSize: "0.75rem",
                                                    color: "var(--color-text-secondary)",
                                                    display: "block",
                                                    marginTop: "0.2rem",
                                                    lineHeight: 1.45,
                                                }}
                                            >
                                                {info.description}
                                            </Typography.Body>
                                            <Typography.Body
                                                style={{
                                                    fontSize: "0.7rem",
                                                    fontFamily: "monospace",
                                                    color: "var(--color-text-secondary)",
                                                    display: "block",
                                                    marginTop: "0.25rem",
                                                }}
                                            >
                                                {info.apiHint} · код права: <strong>{s}</strong>
                                            </Typography.Body>
                                        </span>
                                    </label>
                                );
                            })}
                        </Flex>
                    </div>
                    {assignableInns.length > 0 ? (
                        <div>
                            <Typography.Body style={{ fontSize: "0.8rem", marginBottom: "0.35rem" }}>
                                ИНН (пусто = все доступные вам компании)
                            </Typography.Body>
                            <Flex direction="column" style={{ gap: "0.35rem" }}>
                                {assignableInns.map((inn) => (
                                    <label key={inn} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" }}>
                                        <input
                                            type="checkbox"
                                            checked={!!innChecks[inn]}
                                            onChange={() => setInnChecks((prev) => ({ ...prev, [inn]: !prev[inn] }))}
                                        />
                                        {inn}
                                    </label>
                                ))}
                            </Flex>
                        </div>
                    ) : accessAllInns ? (
                        <div>
                            <Typography.Body style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                                Ограничение по ИНН (через запятую; пусто = без доп. ограничения по списку)
                            </Typography.Body>
                            <Input
                                className="login-input"
                                style={{ width: "100%" }}
                                value={commaInns}
                                onChange={(e) => setCommaInns(e.target.value)}
                                placeholder="7707083893, 7801234567"
                            />
                        </div>
                    ) : (
                        <Typography.Body style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                            Привяжите компании в «Мои компании», чтобы выбрать ИНН для ключа.
                        </Typography.Body>
                    )}
                    <Button onClick={() => void handleCreate()} disabled={creating || loading}>
                        {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        <span style={{ marginLeft: "0.35rem" }}>Создать ключ</span>
                    </Button>
                </div>
            </Panel>

            <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "0.75rem" }}>
                <Typography.Body style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Активные ключи</Typography.Body>
                {!loading && keys.length > 0 ? (
                    <Typography.Body
                        style={{
                            fontSize: "0.72rem",
                            color: "var(--color-text-secondary)",
                            marginBottom: "0.55rem",
                            lineHeight: 1.4,
                        }}
                    >
                        Префикс в отдельной строке можно скопировать в буфер. Секретную часть токена храните только у себя — после
                        создания она больше не показывается.
                    </Typography.Body>
                ) : null}
                {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" style={{ opacity: 0.7 }} />
                ) : keys.length === 0 ? (
                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>Пока нет ключей</Typography.Body>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                        {keys.map((k) => {
                            const copyText = (k.key_prefix && k.key_prefix.length > 0 ? k.key_prefix : k.key_hint).trim();
                            return (
                                <div key={k.id} className="profile-api-keys-active-card">
                                    <Flex align="flex-start" justify="space-between" style={{ gap: "0.5rem" }}>
                                        <Typography.Body style={{ fontWeight: 600, fontSize: "0.9rem", flex: 1, minWidth: 0 }}>
                                            {k.label}
                                        </Typography.Body>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => void handleRevoke(k.id)}
                                            style={{ color: "#b91c1c", flexShrink: 0 }}
                                            title="Отозвать ключ"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </Flex>
                                    <div className="profile-api-keys-keyrow">
                                        <code className="profile-api-keys-keycode">{copyText}</code>
                                        <button
                                            type="button"
                                            className="profile-api-keys-copy-inline"
                                            title="Копировать префикс ключа"
                                            aria-label="Копировать префикс ключа в буфер обмена"
                                            onClick={() => copyKeySnippet(k.id, copyText)}
                                        >
                                            {copiedKeyId === k.id ? (
                                                <Check className="w-4 h-4" strokeWidth={2.5} />
                                            ) : (
                                                <Copy className="w-4 h-4" strokeWidth={2} />
                                            )}
                                        </button>
                                    </div>
                                    <Typography.Body
                                        style={{
                                            fontSize: "0.75rem",
                                            color: "var(--color-text-secondary)",
                                            marginTop: "0.45rem",
                                        }}
                                    >
                                        {(k.scopes || []).map((sc) => scopeTitleRu(String(sc))).join(" · ")}
                                        {k.allowed_inns?.length ? ` · ИНН: ${k.allowed_inns.join(", ")}` : " · ИНН: все доступные"}
                                    </Typography.Body>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Panel>

            <Panel className="cargo-card" style={{ padding: "0" }}>
                <button
                    type="button"
                    onClick={() => setCatalogOpen((v) => !v)}
                    style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "1rem",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                    }}
                >
                    <Typography.Body style={{ fontWeight: 600 }}>
                        {catalogOpen ? "▼" : "▶"} Запросы приложения к API (справочник, как в Postman)
                    </Typography.Body>
                </button>
                {catalogOpen ? (
                    <div style={{ padding: "0 0 1rem" }}>
                        <ProfileApiCatalogPostman
                            tryAuth={
                                activeAccount?.login && activeAccount?.password
                                    ? { login: activeAccount.login, password: activeAccount.password }
                                    : null
                            }
                        />
                    </div>
                ) : null}
            </Panel>
        </div>
    );
}

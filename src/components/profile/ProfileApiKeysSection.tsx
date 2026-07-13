import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, Key, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button, Flex, Input, Panel, Typography } from "@maxhub/max-ui";
import type { Account } from "../../types";
import {
    USER_API_KEY_SCOPES_CLIENT,
    USER_API_KEY_SCOPE_INFO_RU,
    scopeTitleRu,
    type UserApiKeyScopeClient,
} from "../../constants/userApiKeyScopesClient";
import { createMyApiKey, fetchMyApiKeys, revokeMyApiKey, updateMyApiKey, type MyApiKeyRow } from "../../api/client/profile/myApiKeys";
import {
    clearProfileApiKeyToken,
    resolveAutoTestBearer,
    resolveSingleAutoTestInn,
    saveProfileApiKeyToken,
} from "../../lib/profileApiKeySession";
import { ProfileApiCatalogPostman } from "./ProfileApiCatalogPostman";
import { ProfilePartnerApiGuide } from "./ProfilePartnerApiGuide";

type Props = {
    activeAccount: Account | null;
    onBack: () => void;
};

const defaultScopeChecks = (): Record<UserApiKeyScopeClient, boolean> => ({
    "cargo:read": true,
    "invoices:read": false,
    "acts:read": false,
    "orders:read": false,
    "claims:read": false,
    "contracts:read": false,
    "sverki:read": false,
    "tariffs:read": false,
    "documents:read": false,
});

function scopeChecksFromKey(scopes: string[]): Record<UserApiKeyScopeClient, boolean> {
    const base = defaultScopeChecks();
    for (const scope of scopes) {
        if (scope in base) base[scope as UserApiKeyScopeClient] = true;
    }
    return base;
}

function innChecksFromKey(key: MyApiKeyRow, assignableInns: string[]): Record<string, boolean> {
    const next: Record<string, boolean> = {};
    const allowed = new Set((key.allowed_inns || []).map((x) => String(x).trim()));
    for (const inn of assignableInns) next[inn] = allowed.has(inn);
    return next;
}

function ProfileApiScopeChecklist({
    checks,
    onToggle,
    idPrefix = "",
}: {
    checks: Record<UserApiKeyScopeClient, boolean>;
    onToggle: (scope: UserApiKeyScopeClient) => void;
    idPrefix?: string;
}) {
    return (
        <div className="profile-api-keys-scope-list">
            {USER_API_KEY_SCOPES_CLIENT.map((scope) => {
                const info = USER_API_KEY_SCOPE_INFO_RU[scope];
                return (
                    <label
                        key={`${idPrefix}${scope}`}
                        className="profile-api-keys-scope-row"
                        title={info.description}
                    >
                        <input type="checkbox" checked={!!checks[scope]} onChange={() => onToggle(scope)} />
                        <span className="profile-api-keys-scope-row__main">
                            <span className="profile-api-keys-scope-row__title">{info.title}</span>
                            <code className="profile-api-keys-scope-row__hint">{info.apiHint}</code>
                        </span>
                    </label>
                );
            })}
        </div>
    );
}

export function ProfileApiKeysSection({ activeAccount, onBack }: Props) {
    const [keys, setKeys] = useState<MyApiKeyRow[]>([]);
    const [assignableInns, setAssignableInns] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [newLabel, setNewLabel] = useState("");
    const [innChecks, setInnChecks] = useState<Record<string, boolean>>({});
    const [commaInns, setCommaInns] = useState("");
    const [scopeChecks, setScopeChecks] = useState(defaultScopeChecks);
    const [newToken, setNewToken] = useState<string | null>(null);
    const [catalogOpen, setCatalogOpen] = useState(false);
    const [guideOpen, setGuideOpen] = useState(false);
    const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
    const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
    const [editScopeChecks, setEditScopeChecks] = useState(defaultScopeChecks);
    const [editInnChecks, setEditInnChecks] = useState<Record<string, boolean>>({});
    const [editCommaInns, setEditCommaInns] = useState("");
    const [savingKeyId, setSavingKeyId] = useState<string | null>(null);
    const [togglingKeyId, setTogglingKeyId] = useState<string | null>(null);

    const login = activeAccount?.login?.trim() || "";
    const password = activeAccount?.password || "";
    const accessAllInns = activeAccount?.accessAllInns === true;

    const load = useCallback(async () => {
        if (!login || !password) return;
        setLoading(true);
        setError(null);
        try {
            const data = await fetchMyApiKeys(login, password);
            setKeys(data.keys);
            const ai = data.assignable_inns;
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

    const autoTestInn = useMemo(() => resolveSingleAutoTestInn(keys, assignableInns), [keys, assignableInns]);
    const autoTestBearer = useMemo(
        () => resolveAutoTestBearer(login, keys, autoTestInn, newToken),
        [login, keys, autoTestInn, newToken],
    );
    const autoTestPrefill = keys.filter((k) => k.enabled !== false).length === 1 && autoTestInn != null;

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

    const buildSelectedScopes = (): UserApiKeyScopeClient[] =>
        USER_API_KEY_SCOPES_CLIENT.filter((s) => scopeChecks[s]);

    const handleCreate = async () => {
        if (!login || !password) return;
        const scopes = buildSelectedScopes();
        if (scopes.length === 0) {
            setError("Выберите хотя бы один scope (перевозки, счета, УПД, заявки и т.д.).");
            return;
        }
        const allowed = buildAllowedInnsPayload();
        setCreating(true);
        setError(null);
        setNewToken(null);
        try {
            const data = await createMyApiKey({
                login,
                password,
                label: newLabel.trim() || "API key",
                scopes,
                allowed_inns: allowed,
            });
            if (typeof data.token === "string") {
                setNewToken(data.token);
                if (data.id) saveProfileApiKeyToken(login, data.id, data.token);
            }
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
            await revokeMyApiKey(login, password, id);
            clearProfileApiKeyToken(login, id);
            if (editingKeyId === id) setEditingKeyId(null);
            await load();
        } catch (e: unknown) {
            setError((e as Error)?.message || "Ошибка");
        }
    };

    const handleToggleEnabled = async (key: MyApiKeyRow, nextEnabled: boolean) => {
        if (!login || !password) return;
        setTogglingKeyId(key.id);
        setError(null);
        try {
            await updateMyApiKey({ login, password, id: key.id, enabled: nextEnabled });
            await load();
        } catch (e: unknown) {
            setError((e as Error)?.message || "Ошибка");
        } finally {
            setTogglingKeyId(null);
        }
    };

    const openKeyEditor = (key: MyApiKeyRow) => {
        setEditingKeyId(key.id);
        setEditScopeChecks(scopeChecksFromKey(key.scopes || []));
        if (assignableInns.length > 0) {
            setEditInnChecks(innChecksFromKey(key, assignableInns));
            setEditCommaInns("");
        } else {
            setEditInnChecks({});
            setEditCommaInns((key.allowed_inns || []).join(", "));
        }
    };

    const buildEditAllowedInnsPayload = (): string[] => {
        if (assignableInns.length > 0) {
            return assignableInns.filter((inn) => editInnChecks[inn]);
        }
        if (accessAllInns) {
            return editCommaInns
                .split(/[\s,;]+/)
                .map((x) => x.replace(/\D/g, "").trim())
                .filter(Boolean);
        }
        return [];
    };

    const handleSaveKeyEdit = async (id: string) => {
        if (!login || !password) return;
        const scopes = USER_API_KEY_SCOPES_CLIENT.filter((s) => editScopeChecks[s]);
        if (scopes.length === 0) {
            setError("Выберите хотя бы один scope.");
            return;
        }
        setSavingKeyId(id);
        setError(null);
        try {
            await updateMyApiKey({
                login,
                password,
                id,
                scopes,
                allowed_inns: buildEditAllowedInnsPayload(),
            });
            setEditingKeyId(null);
            await load();
        } catch (e: unknown) {
            setError((e as Error)?.message || "Ошибка сохранения");
        } finally {
            setSavingKeyId(null);
        }
    };

    if (!activeAccount?.isRegisteredUser) {
        return (
            <div className="w-full profile-api-keys-root">
                <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                    <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline className="text-page-title">API</Typography.Headline>
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
                <Typography.Headline className="text-page-title">API</Typography.Headline>
            </Flex>

            {error ? (
                <Panel className="cargo-card" style={{ padding: "0.75rem", marginBottom: "0.75rem", border: "1px solid rgba(239,68,68,0.35)" }}>
                    <Typography.Body style={{ fontSize: "0.85rem", color: "#ef4444" }}>{error}</Typography.Body>
                </Panel>
            ) : null}

            <Panel className="cargo-card" style={{ padding: "0", marginBottom: "0.75rem" }}>
                <button
                    type="button"
                    onClick={() => setGuideOpen((v) => !v)}
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
                        {guideOpen ? "▼" : "▶"} Описание Partner API
                    </Typography.Body>
                </button>
                {guideOpen ? (
                    <div style={{ padding: "0 1rem 1rem" }}>
                        <ProfilePartnerApiGuide />
                    </div>
                ) : null}
            </Panel>

            {newToken ? (
                <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "0.75rem", background: "rgba(16,185,129,0.08)" }}>
                    <Typography.Body style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Сохраните токен</Typography.Body>
                    <div className="profile-api-keys-keyrow">
                        <code className="profile-api-keys-keycode">{newToken}</code>
                        <button
                            type="button"
                            className="profile-api-keys-copy-inline"
                            title="Копировать токен"
                            aria-label="Копировать токен в буфер обмена"
                            onClick={() => copyKeySnippet("__new_token__", newToken)}
                        >
                            {copiedKeyId === "__new_token__" ? (
                                <Check className="w-4 h-4" strokeWidth={2.5} />
                            ) : (
                                <Copy className="w-4 h-4" strokeWidth={2} />
                            )}
                        </button>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setNewToken(null)} style={{ marginTop: "0.5rem" }}>
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
                        <Typography.Body style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}>Права (scope)</Typography.Body>
                        <ProfileApiScopeChecklist
                            checks={scopeChecks}
                            onToggle={(scope) => setScopeChecks((prev) => ({ ...prev, [scope]: !prev[scope] }))}
                        />
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
                        Префикс можно копировать. Полный токен показывается один раз при создании. Поле last_used_at обновляется при вызове Partner API.
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
                            const isEnabled = k.enabled !== false;
                            const isEditing = editingKeyId === k.id;
                            return (
                                <div
                                    key={k.id}
                                    className={`profile-api-keys-active-card${isEnabled ? "" : " profile-api-keys-active-card--disabled"}`}
                                >
                                    <Flex align="center" justify="space-between" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                                        <Typography.Body style={{ fontWeight: 600, fontSize: "0.9rem", flex: 1, minWidth: 0 }}>
                                            {k.label}
                                            {!isEnabled ? (
                                                <span className="profile-api-keys-disabled-badge"> отключён</span>
                                            ) : null}
                                        </Typography.Body>
                                        <div className="profile-api-keys-active-actions">
                                            <label
                                                className="profile-api-keys-toggle switch-wrapper"
                                                title={isEnabled ? "Отключить ключ" : "Включить ключ"}
                                            >
                                                <span className="profile-api-keys-toggle-label">
                                                    {togglingKeyId === k.id ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : isEnabled ? (
                                                        "Вкл."
                                                    ) : (
                                                        "Выкл."
                                                    )}
                                                </span>
                                                <input
                                                    type="checkbox"
                                                    checked={isEnabled}
                                                    disabled={togglingKeyId === k.id}
                                                    onChange={() => void handleToggleEnabled(k, !isEnabled)}
                                                    aria-label={isEnabled ? "Отключить ключ" : "Включить ключ"}
                                                />
                                                <span
                                                    className={`switch-container profile-api-keys-toggle-switch${isEnabled ? " checked" : ""}`}
                                                    aria-hidden
                                                >
                                                    <span className="switch-knob" />
                                                </span>
                                            </label>
                                            <button
                                                type="button"
                                                className={`profile-api-keys-icon-btn${isEditing ? " is-active" : ""}`}
                                                title="Изменить права"
                                                aria-label="Изменить права ключа"
                                                onClick={() => (isEditing ? setEditingKeyId(null) : openKeyEditor(k))}
                                            >
                                                {isEditing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                                            </button>
                                            <button
                                                type="button"
                                                className="profile-api-keys-delete-btn"
                                                onClick={() => void handleRevoke(k.id)}
                                                title="Отозвать ключ"
                                                aria-label="Отозвать ключ"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
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
                                    {!isEditing ? (
                                        <Typography.Body
                                            style={{
                                                fontSize: "0.75rem",
                                                color: "var(--color-text-secondary)",
                                                marginTop: "0.45rem",
                                            }}
                                        >
                                            {(k.scopes || []).map((sc) => scopeTitleRu(String(sc))).join(" · ") || "Partner v1"}
                                            {k.allowed_inns?.length ? ` · ИНН: ${k.allowed_inns.join(", ")}` : " · ИНН: все доступные"}
                                            {k.last_used_at ? ` · использован: ${new Date(k.last_used_at).toLocaleString("ru-RU")}` : ""}
                                        </Typography.Body>
                                    ) : (
                                        <div className="profile-api-keys-edit-panel">
                                            <Typography.Body style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                                                Права (scope)
                                            </Typography.Body>
                                            <ProfileApiScopeChecklist
                                                idPrefix={`${k.id}-`}
                                                checks={editScopeChecks}
                                                onToggle={(scope) =>
                                                    setEditScopeChecks((prev) => ({ ...prev, [scope]: !prev[scope] }))
                                                }
                                            />
                                            {assignableInns.length > 0 ? (
                                                <div style={{ marginBottom: "0.65rem" }}>
                                                    <Typography.Body style={{ fontSize: "0.8rem", marginBottom: "0.35rem" }}>
                                                        ИНН (пусто = все доступные)
                                                    </Typography.Body>
                                                    <Flex direction="column" style={{ gap: "0.3rem" }}>
                                                        {assignableInns.map((inn) => (
                                                            <label
                                                                key={`${k.id}-inn-${inn}`}
                                                                style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem" }}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!editInnChecks[inn]}
                                                                    onChange={() =>
                                                                        setEditInnChecks((prev) => ({ ...prev, [inn]: !prev[inn] }))
                                                                    }
                                                                />
                                                                {inn}
                                                            </label>
                                                        ))}
                                                    </Flex>
                                                </div>
                                            ) : accessAllInns ? (
                                                <div style={{ marginBottom: "0.65rem" }}>
                                                    <Typography.Body style={{ fontSize: "0.8rem", marginBottom: "0.25rem" }}>
                                                        Ограничение по ИНН (через запятую)
                                                    </Typography.Body>
                                                    <Input
                                                        className="login-input"
                                                        style={{ width: "100%" }}
                                                        value={editCommaInns}
                                                        onChange={(e) => setEditCommaInns(e.target.value)}
                                                        placeholder="7707083893, 7801234567"
                                                    />
                                                </div>
                                            ) : null}
                                            <Flex style={{ gap: "0.5rem" }}>
                                                <Button
                                                    size="sm"
                                                    onClick={() => void handleSaveKeyEdit(k.id)}
                                                    disabled={savingKeyId === k.id}
                                                >
                                                    {savingKeyId === k.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        "Сохранить"
                                                    )}
                                                </Button>
                                                <Button size="sm" variant="secondary" onClick={() => setEditingKeyId(null)}>
                                                    Отмена
                                                </Button>
                                            </Flex>
                                        </div>
                                    )}
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
                        {catalogOpen ? "▼" : "▶"} Запросы приложения к API
                    </Typography.Body>
                </button>
                {catalogOpen ? (
                    <div style={{ padding: "0 0 1rem" }}>
                        <ProfileApiCatalogPostman
                            tryAuth={
                                login
                                    ? {
                                          inn: autoTestInn ?? undefined,
                                          login,
                                          password: password || undefined,
                                      }
                                    : autoTestInn
                                      ? { inn: autoTestInn }
                                      : null
                            }
                            defaultBearer={autoTestBearer}
                            autoTestPrefill={autoTestPrefill}
                        />
                    </div>
                ) : null}
            </Panel>
        </div>
    );
}

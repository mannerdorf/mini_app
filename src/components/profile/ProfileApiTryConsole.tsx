import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Loader2, Play, X } from "lucide-react";
import type { ApiInventoryItem, ApiTryExample } from "../../constants/miniAppApiInventory";
import { PARTNER_API_PUBLIC_ORIGIN } from "../../constants/partnerApi";
import {
    apiSnippetLanguageOptions,
    buildApiRequestSnippet,
    type ApiRequestParts,
    type ApiSnippetLanguage,
} from "../../lib/buildApiRequestSnippet";
import { resolveApiOrigin } from "../../lib/resolveApiOrigin";

export type ProfileTryAuth = { login: string; password: string } | null;

type ParamRow = { enabled: boolean; key: string; value: string };

function parseMethods(raw: string): string[] {
    return raw
        .split(/[/,|]+/)
        .map((x) => x.trim().toUpperCase())
        .filter(Boolean);
}

function injectAuthPlaceholders(obj: unknown, auth: ProfileTryAuth): unknown {
    if (!auth) return obj;
    if (typeof obj === "string") {
        if (obj === "{{LOGIN}}") return auth.login;
        if (obj === "{{PASSWORD}}") return auth.password;
        return obj;
    }
    if (Array.isArray(obj)) return obj.map((x) => injectAuthPlaceholders(x, auth));
    if (obj && typeof obj === "object") {
        const o: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            o[k] = injectAuthPlaceholders(v, auth);
        }
        return o;
    }
    return obj;
}

function buildExamples(item: ApiInventoryItem): ApiTryExample[] {
    if (item.examples && item.examples.length > 0) return item.examples;
    const m = (parseMethods(item.method)[0] || "GET").toUpperCase();
    if (m === "GET" || m === "HEAD") {
        return [{ id: "default", label: "Базовый запрос", query: {} }];
    }
    return [
        {
            id: "default",
            label: "Минимум (подставьте логин/пароль в JSON)",
            body: { login: "{{LOGIN}}", password: "{{PASSWORD}}" },
        },
    ];
}

function queryToRows(q: Record<string, string> | undefined): ParamRow[] {
    const rows: ParamRow[] = Object.entries(q || {}).map(([key, value]) => ({
        enabled: true,
        key,
        value: String(value ?? ""),
    }));
    const pad = Math.max(0, 5 - rows.length);
    for (let i = 0; i < pad; i++) rows.push({ enabled: false, key: "", value: "" });
    return rows.slice(0, 12);
}

const METHOD_PILL: Record<string, { bg: string; fg: string }> = {
    GET: { bg: "#49cc90", fg: "#fff" },
    POST: { bg: "#fca130", fg: "#1a1a1a" },
    PUT: { bg: "#fca130", fg: "#1a1a1a" },
    PATCH: { bg: "#50e3c2", fg: "#0f172a" },
    DELETE: { bg: "#f93e3e", fg: "#fff" },
    HEAD: { bg: "#9012fe", fg: "#fff" },
};

type TabId = "params" | "headers" | "body" | "auth";

type Props = {
    item: ApiInventoryItem;
    tryAuth: ProfileTryAuth;
    onClose: () => void;
};

/**
 * Консоль теста запроса (оформление в духе Postman): примеры, вкладки, Send, ответ сервера.
 */
export function ProfileApiTryConsole({ item, tryAuth, onClose }: Props) {
    const examples = useMemo(() => buildExamples(item), [item]);
    const methodsAvail = useMemo(() => parseMethods(item.method), [item.method]);
    const [exampleId, setExampleId] = useState(examples[0]?.id ?? "default");
    const [methodSel, setMethodSel] = useState(methodsAvail[0] || "GET");
    const [pathField, setPathField] = useState(item.path);
    const [tab, setTab] = useState<TabId>("params");
    const [paramRows, setParamRows] = useState<ParamRow[]>(() => queryToRows(examples[0]?.query));
    const [headersJson, setHeadersJson] = useState("{}");
    const [bodyJson, setBodyJson] = useState(() =>
        examples[0]?.body != null ? JSON.stringify(examples[0].body, null, 2) : "",
    );
    const [bearer, setBearer] = useState("");
    const [loading, setLoading] = useState(false);
    const [resp, setResp] = useState<{ status: number; ok: boolean; body: string; ms: number } | null>(null);
    const [sendErr, setSendErr] = useState<string | null>(null);
    const [snippetLang, setSnippetLang] = useState<ApiSnippetLanguage>("curl");
    const [snippetCopied, setSnippetCopied] = useState(false);

    const apiOrigin = useMemo(() => (typeof window !== "undefined" ? resolveApiOrigin() : PARTNER_API_PUBLIC_ORIGIN), []);

    const headerKeyCount = useMemo(() => {
        try {
            const o = JSON.parse(headersJson || "{}") as unknown;
            if (o && typeof o === "object" && !Array.isArray(o)) return Object.keys(o as Record<string, unknown>).length;
        } catch {
            /* ignore */
        }
        return 0;
    }, [headersJson]);

    useEffect(() => {
        const m = parseMethods(item.method);
        setMethodSel(m[0] || "GET");
        setPathField(item.path);
        const ex = buildExamples(item);
        setExampleId(ex[0]?.id ?? "default");
    }, [item]);

    useEffect(() => {
        const ex = examples.find((e) => e.id === exampleId) ?? examples[0];
        if (!ex) return;
        setParamRows(queryToRows(ex.query));
        setBodyJson(ex.body != null ? JSON.stringify(ex.body, null, 2) : "");
        setHeadersJson(ex.headers && Object.keys(ex.headers).length > 0 ? JSON.stringify(ex.headers, null, 2) : "{}");
    }, [exampleId, examples]);

    const origin = apiOrigin;
    const fullUrl = `${origin}${pathField.startsWith("/") ? pathField : `/${pathField}`}`;
    const isPartnerV1 = pathField.includes("/api/partner/v1/");

    const collectRequestParts = useCallback((forSnippet = false): { parts: ApiRequestParts | null; error?: string } => {
        const method = methodSel.toUpperCase();
        let path = pathField.trim() || item.path;
        if (!path.startsWith("/")) path = `/${path}`;

        const qs = new URLSearchParams();
        for (const r of paramRows) {
            if (r.enabled && r.key.trim()) qs.set(r.key.trim(), r.value);
        }
        const url = `${origin}${path}${qs.toString() ? `?${qs.toString()}` : ""}`;

        const headers: Record<string, string> = {};
        let extra: Record<string, string> = {};
        try {
            extra = JSON.parse(headersJson || "{}") as Record<string, string>;
            if (typeof extra !== "object" || extra === null || Array.isArray(extra)) throw new Error("headers не объект");
        } catch {
            return { parts: null, error: "Вкладка «Заголовки»: невалидный JSON объекта" };
        }
        for (const [k, v] of Object.entries(extra)) {
            if (k.trim()) headers[k.trim()] = String(v ?? "");
        }

        const bearerRaw = bearer.trim();
        const bearerForRequest = bearerRaw || (forSnippet && isPartnerV1 ? "haulz_YOUR_FULL_API_KEY" : "");
        if (bearerForRequest) {
            headers.Authorization = bearerForRequest.startsWith("Bearer ") ? bearerForRequest : `Bearer ${bearerForRequest}`;
        }

        if (path.includes("/api/my-api-keys") && tryAuth && (method === "GET" || method === "DELETE")) {
            headers["x-login"] = tryAuth.login;
            headers["x-password"] = tryAuth.password;
        }

        let body: string | undefined;
        if (!["GET", "HEAD"].includes(method)) {
            const raw = bodyJson.trim();
            if (raw) {
                try {
                    const parsed = JSON.parse(raw) as unknown;
                    const injected = injectAuthPlaceholders(parsed, tryAuth);
                    body = JSON.stringify(injected, null, forSnippet ? 2 : 0);
                    headers["Content-Type"] = headers["Content-Type"] || "application/json";
                } catch {
                    return { parts: null, error: "Вкладка «Тело»: невалидный JSON" };
                }
            }
        }

        return { parts: { method, url, headers, body } };
    }, [bearer, bodyJson, headersJson, isPartnerV1, item.path, methodSel, origin, paramRows, pathField, tryAuth]);

    const requestParts = useMemo(() => collectRequestParts(true).parts, [collectRequestParts]);
    const snippetText = useMemo(
        () => (requestParts ? buildApiRequestSnippet(requestParts, snippetLang) : ""),
        [requestParts, snippetLang],
    );

    const send = useCallback(async () => {
        setSendErr(null);
        setResp(null);
        const collected = collectRequestParts(false);
        if (!collected.parts) {
            setSendErr(collected.error || "Не удалось собрать запрос");
            return;
        }
        const { method, url, headers, body } = collected.parts;

        setLoading(true);
        const t0 = Date.now();
        try {
            const res = await fetch(url, { method, headers, body: body?.trim() ? body : undefined });
            const text = await res.text();
            let pretty = text;
            try {
                pretty = JSON.stringify(JSON.parse(text), null, 2);
            } catch {
                // оставить как текст
            }
            setResp({ status: res.status, ok: res.ok, body: pretty, ms: Date.now() - t0 });
        } catch (e: unknown) {
            setSendErr((e as Error)?.message || "Ошибка сети");
        } finally {
            setLoading(false);
        }
    }, [collectRequestParts]);

    const copySnippet = useCallback(() => {
        if (!snippetText) return;
        void navigator.clipboard?.writeText(snippetText).catch(() => {});
        setSnippetCopied(true);
        window.setTimeout(() => setSnippetCopied(false), 1600);
    }, [snippetText]);

    const pill = METHOD_PILL[methodSel] ?? { bg: "#6b7280", fg: "#fff" };

    return (
        <div className="profile-api-try">
            <div className="profile-api-try__toolbar">
                <div className="profile-api-try__toolbar-left">
                    <span className="profile-api-try__pill" style={{ background: pill.bg, color: pill.fg }}>
                        {methodSel}
                    </span>
                    {methodsAvail.length > 1 ? (
                        <select
                            className="profile-api-try__method-select"
                            value={methodSel}
                            onChange={(e) => setMethodSel(e.target.value)}
                            aria-label="HTTP-метод"
                        >
                            {methodsAvail.map((m) => (
                                <option key={m} value={m}>
                                    {m}
                                </option>
                            ))}
                        </select>
                    ) : null}
                </div>
                <button type="button" className="profile-api-try__close" onClick={onClose} title="Закрыть консоль" aria-label="Закрыть">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="profile-api-try__url-row">
                <input
                    className="profile-api-try__url-input"
                    type="text"
                    value={fullUrl}
                    readOnly
                    aria-readonly
                    onFocus={(e) => e.target.select()}
                />
                <button type="button" className="profile-api-try__send" onClick={() => void send()} disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" fill="currentColor" />}
                    <span>Send</span>
                </button>
            </div>

            <p className="profile-api-try__hint profile-api-try__hint--origin">
                Базовый URL для внешних интеграций: <code>{PARTNER_API_PUBLIC_ORIGIN}</code>
                {origin !== PARTNER_API_PUBLIC_ORIGIN ? (
                    <>
                        {" "}
                        (из приложения запрос уходит на <code>{origin}</code>)
                    </>
                ) : null}
            </p>

            <div className="profile-api-try__path-edit">
                <span className="profile-api-try__path-label">Путь</span>
                <input
                    className="profile-api-try__path-input"
                    value={pathField}
                    onChange={(e) => setPathField(e.target.value)}
                    spellCheck={false}
                />
            </div>

            <div className="profile-api-try__example-row">
                <label className="profile-api-try__example-label" htmlFor="profile-api-try-example">
                    Пример запроса
                </label>
                <select
                    id="profile-api-try-example"
                    className="profile-api-try__example-select"
                    value={exampleId}
                    onChange={(e) => setExampleId(e.target.value)}
                >
                    {examples.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                            {ex.label}
                        </option>
                    ))}
                </select>
            </div>

            <p className="profile-api-try__note">{item.note}</p>

            <div className="profile-api-try__tabs" role="tablist">
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "params"}
                    className={`profile-api-try__tab${tab === "params" ? " is-active" : ""}`}
                    onClick={() => setTab("params")}
                >
                    Params
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "headers"}
                    className={`profile-api-try__tab${tab === "headers" ? " is-active" : ""}`}
                    onClick={() => setTab("headers")}
                >
                    Headers
                    {headerKeyCount > 0 ? <span className="profile-api-try__tab-badge">{headerKeyCount}</span> : null}
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "body"}
                    className={`profile-api-try__tab${tab === "body" ? " is-active" : ""}`}
                    onClick={() => setTab("body")}
                >
                    Body
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={tab === "auth"}
                    className={`profile-api-try__tab${tab === "auth" ? " is-active" : ""}`}
                    onClick={() => setTab("auth")}
                >
                    Authorization
                </button>
            </div>

            {tab === "params" ? (
                <div className="profile-api-try__panel">
                    <div className="profile-api-try__table-head">
                        <span />
                        <span>Key</span>
                        <span>Value</span>
                    </div>
                    {paramRows.map((row, i) => (
                        <div key={i} className="profile-api-try__table-row">
                            <input
                                type="checkbox"
                                checked={row.enabled}
                                onChange={(e) => {
                                    const next = [...paramRows];
                                    next[i] = { ...row, enabled: e.target.checked };
                                    setParamRows(next);
                                }}
                            />
                            <input
                                className="profile-api-try__cell"
                                value={row.key}
                                placeholder="ключ"
                                onChange={(e) => {
                                    const next = [...paramRows];
                                    next[i] = { ...row, key: e.target.value };
                                    setParamRows(next);
                                }}
                            />
                            <input
                                className="profile-api-try__cell"
                                value={row.value}
                                placeholder="значение"
                                onChange={(e) => {
                                    const next = [...paramRows];
                                    next[i] = { ...row, value: e.target.value };
                                    setParamRows(next);
                                }}
                            />
                        </div>
                    ))}
                    <p className="profile-api-try__hint">Для GET параметры уходят в query string. Для POST с телом см. вкладку Body.</p>
                </div>
            ) : null}

            {tab === "headers" ? (
                <div className="profile-api-try__panel">
                    <textarea
                        className="profile-api-try__textarea"
                        value={headersJson}
                        onChange={(e) => setHeadersJson(e.target.value)}
                        spellCheck={false}
                        rows={6}
                        placeholder='{"X-Custom": "value"}'
                    />
                </div>
            ) : null}

            {tab === "body" ? (
                <div className="profile-api-try__panel">
                    <textarea
                        className="profile-api-try__textarea profile-api-try__textarea--mono"
                        value={bodyJson}
                        onChange={(e) => setBodyJson(e.target.value)}
                        spellCheck={false}
                        rows={12}
                        placeholder="JSON тело"
                    />
                    <p className="profile-api-try__hint">
                        Строки <code>{"{{LOGIN}}"}</code> и <code>{"{{PASSWORD}}"}</code> в JSON заменяются на данные текущего аккаунта (если
                        вы вошли в приложение).
                    </p>
                </div>
            ) : null}

            {tab === "auth" ? (
                <div className="profile-api-try__panel">
                    <label className="profile-api-try__auth-label" htmlFor="profile-api-bearer">
                        Bearer-токен (API-ключ haulz_… или партнёрский ключ)
                    </label>
                    <textarea
                        id="profile-api-bearer"
                        className="profile-api-try__textarea profile-api-try__textarea--mono"
                        value={bearer}
                        onChange={(e) => setBearer(e.target.value)}
                        rows={3}
                        placeholder="Bearer haulz_… или только токен без префикса"
                    />
                    <p className="profile-api-try__hint">
                        Для Partner API v1 (<code>/api/partner/v1/*</code>) укажите Bearer с полным ключом haulz_… из Профиль → API.
                        {isPartnerV1 ? " Этот метод не принимает login/password в теле." : " Для счетов, УПД и скачиваний в теле используются login/password (или плейсхолдеры)."}
                    </p>
                    {!tryAuth ? (
                        <p className="profile-api-try__warn">Войдите в аккаунт в приложении — иначе подстановка логина/пароля в примерах не сработает.</p>
                    ) : null}
                </div>
            ) : null}

            {sendErr ? <div className="profile-api-try__error">{sendErr}</div> : null}

            <div className="profile-api-try__snippet">
                <div className="profile-api-try__snippet-head">
                    <span className="profile-api-try__snippet-title">Code snippet</span>
                    <div className="profile-api-try__snippet-actions">
                        <select
                            className="profile-api-try__snippet-select"
                            value={snippetLang}
                            onChange={(e) => setSnippetLang(e.target.value as ApiSnippetLanguage)}
                            aria-label="Формат примера запроса"
                        >
                            {apiSnippetLanguageOptions().map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            className="profile-api-try__snippet-copy"
                            onClick={copySnippet}
                            title="Скопировать пример"
                            aria-label="Скопировать пример запроса"
                        >
                            <Copy className="w-4 h-4" />
                            <span>{snippetCopied ? "Скопировано" : "Копировать"}</span>
                        </button>
                    </div>
                </div>
                <pre className="profile-api-try__snippet-pre">{snippetText || "—"}</pre>
                {isPartnerV1 && !bearer.trim() ? (
                    <p className="profile-api-try__hint">
                        В примере подставлен плейсхолдер <code>haulz_YOUR_FULL_API_KEY</code> — замените на полный ключ из вкладки Authorization.
                    </p>
                ) : null}
            </div>

            <div className="profile-api-try__response-head">Response</div>
            <div className="profile-api-try__response-box">
                {loading ? (
                    <div className="profile-api-try__response-empty">
                        <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                ) : resp ? (
                    <>
                        <div className="profile-api-try__response-meta">
                            <span className={`profile-api-try__status${resp.ok ? " is-ok" : " is-err"}`}>{resp.status}</span>
                            <span className="profile-api-try__time">{resp.ms} ms</span>
                        </div>
                        <pre className="profile-api-try__response-pre">{resp.body}</pre>
                    </>
                ) : (
                    <div className="profile-api-try__response-empty">Нажмите Send — ответ появится здесь</div>
                )}
            </div>
        </div>
    );
}

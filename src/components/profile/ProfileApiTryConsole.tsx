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

export type ProfileTryAuth = {
    inn?: string;
    login?: string;
    password?: string;
    isRegisteredUser?: boolean;
} | null;

type ParamRow = { enabled: boolean; key: string; value: string };

const HAULZ_API_KEY_RE = /^haulz_([a-f0-9]{12})_([a-f0-9]{64})$/i;

function parseMethods(raw: string): string[] {
    return raw
        .split(/[/,|]+/)
        .map((x) => x.trim().toUpperCase())
        .filter(Boolean);
}

function injectAuthPlaceholders(obj: unknown, auth: ProfileTryAuth): unknown {
    if (!auth) return obj;
    if (typeof obj === "string") {
        if (obj === "{{INN}}") return auth.inn?.trim() || obj;
        if (obj === "{{LOGIN}}") return auth.login?.trim() || obj;
        if (obj === "{{PASSWORD}}") return auth.password ?? obj;
        return obj;
    }
    if (Array.isArray(obj)) return obj.map((x) => injectAuthPlaceholders(x, auth));
    if (obj && typeof obj === "object") {
        const o: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            o[k] = injectAuthPlaceholders(v, auth);
        }
        if (auth.isRegisteredUser === true && !("isRegisteredUser" in o)) {
            o.isRegisteredUser = true;
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
    return [{ id: "default", label: "Базовый запрос", body: { dateFrom: "2026-01-01", dateTo: "2026-01-31", inn: "{{INN}}", serviceMode: false } }];
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

function formatBodyFieldValue(value: unknown): string {
    if (typeof value === "string") return value;
    return JSON.stringify(value);
}

/** Поля, которые всегда уходят строкой (номера перевозок с ведущими нулями и т.п.). */
const STRING_BODY_KEYS = new Set([
    "number",
    "Number",
    "Номер",
    "metod",
    "Metod",
    "login",
    "Login",
    "password",
    "Password",
    "inn",
    "Inn",
    "INN",
    "dateDoc",
    "DateDoc",
]);

function parseBodyFieldValue(raw: string, key?: string): unknown {
    const t = raw.trim();
    if (!t) return "";
    const keyNorm = key?.trim();
    if (keyNorm && STRING_BODY_KEYS.has(keyNorm)) return raw.trim();
    if (t === "true") return true;
    if (t === "false") return false;
    if (t === "null") return null;
    // Числовая строка с ведущими нулями — идентификатор, не number.
    if (/^0+\d+$/.test(t)) return t;
    if (/^-?\d+$/.test(t)) return Number(t);
    if (/^-?\d+\.\d+$/.test(t)) return Number(t);
    if (t.startsWith("{") || t.startsWith("[") || (t.startsWith('"') && t.endsWith('"'))) {
        try {
            return JSON.parse(t);
        } catch {
            return t;
        }
    }
    return t;
}

function parseBodyJsonToRows(json: string): ParamRow[] | null {
    const raw = json.trim();
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
        const rows: ParamRow[] = Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
            enabled: true,
            key,
            value: formatBodyFieldValue(value),
        }));
        const pad = Math.max(0, 5 - rows.length);
        for (let i = 0; i < pad; i++) rows.push({ enabled: false, key: "", value: "" });
        return rows.slice(0, 16);
    } catch {
        return null;
    }
}

function rowsToBodyJson(rows: ParamRow[]): string {
    const obj: Record<string, unknown> = {};
    for (const row of rows) {
        if (row.enabled && row.key.trim()) obj[row.key.trim()] = parseBodyFieldValue(row.value, row.key.trim());
    }
    return JSON.stringify(obj, null, 2);
}

type TabId = "params" | "headers" | "body" | "auth";

function defaultTabForItem(item: ApiInventoryItem): TabId {
    const m = (parseMethods(item.method)[0] || "GET").toUpperCase();
    if (["POST", "PUT", "PATCH"].includes(m)) {
        const ex = buildExamples(item)[0];
        if (ex?.body != null) return "body";
    }
    return "params";
}

function validatePartnerBearer(token: string, path: string): string | null {
    if (!path.includes("/api/partner/v1/")) return null;
    if (path.includes("/health")) return null;
    const t = token.replace(/^Bearer\s+/i, "").trim();
    if (!t) return "Укажите полный API-ключ на вкладке Authorization (Bearer haulz_…).";
    if (HAULZ_API_KEY_RE.test(t)) return null;
    if (t.startsWith("haulz_") && (t.endsWith("_") || !t.includes("_", 6))) {
        return "Указан только префикс ключа (haulz_…_). Нужен полный токен haulz_<id>_<секрет 64 символа>, который показывается один раз при создании ключа.";
    }
    return "Неверный формат ключа. Ожидается haulz_<12 hex>_<64 hex>.";
}

const METHOD_PILL: Record<string, { bg: string; fg: string }> = {
    GET: { bg: "#49cc90", fg: "#fff" },
    POST: { bg: "#fca130", fg: "#1a1a1a" },
    PUT: { bg: "#fca130", fg: "#1a1a1a" },
    PATCH: { bg: "#50e3c2", fg: "#0f172a" },
    DELETE: { bg: "#f93e3e", fg: "#fff" },
    HEAD: { bg: "#9012fe", fg: "#fff" },
};

type Props = {
    item: ApiInventoryItem;
    tryAuth: ProfileTryAuth;
    defaultBearer?: string | null;
    autoTestPrefill?: boolean;
    onClose?: () => void;
};

/**
 * Консоль теста запроса (оформление в духе Postman): примеры, вкладки, Send, ответ сервера.
 */
export function ProfileApiTryConsole({ item, tryAuth, defaultBearer, autoTestPrefill, onClose }: Props) {
    const examples = useMemo(() => buildExamples(item), [item]);
    const methodsAvail = useMemo(() => parseMethods(item.method), [item.method]);
    const [exampleId, setExampleId] = useState(examples[0]?.id ?? "default");
    const [methodSel, setMethodSel] = useState(methodsAvail[0] || "GET");
    const [pathField, setPathField] = useState(item.path);
    const [tab, setTab] = useState<TabId>(() => defaultTabForItem(item));
    const [paramRows, setParamRows] = useState<ParamRow[]>(() => queryToRows(examples[0]?.query));
    const [headersJson, setHeadersJson] = useState("{}");
    const [bodyJson, setBodyJson] = useState(() =>
        examples[0]?.body != null ? JSON.stringify(examples[0].body, null, 2) : "",
    );
    const [bearer, setBearer] = useState(defaultBearer?.trim() || "");
    const [showRawBodyJson, setShowRawBodyJson] = useState(false);
    const [loading, setLoading] = useState(false);
    const [resp, setResp] = useState<{ status: number; ok: boolean; body: string; ms: number } | null>(null);
    const [sendErr, setSendErr] = useState<string | null>(null);
    const [snippetLang, setSnippetLang] = useState<ApiSnippetLanguage>("curl");
    const [snippetCopied, setSnippetCopied] = useState(false);

    const apiOrigin = useMemo(() => (typeof window !== "undefined" ? resolveApiOrigin() : PARTNER_API_PUBLIC_ORIGIN), []);

    const bodyRows = useMemo(() => parseBodyJsonToRows(bodyJson), [bodyJson]);
    const bodyFieldCount = useMemo(() => bodyRows?.filter((r) => r.enabled && r.key.trim()).length ?? 0, [bodyRows]);

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
        setTab(defaultTabForItem(item));
        const ex = buildExamples(item);
        setExampleId(ex[0]?.id ?? "default");
    }, [item]);

    useEffect(() => {
        if (defaultBearer?.trim()) setBearer(defaultBearer.trim());
    }, [defaultBearer]);

    const updateBodyRows = useCallback((nextRows: ParamRow[]) => {
        setBodyJson(rowsToBodyJson(nextRows));
    }, []);

    useEffect(() => {
        const ex = examples.find((e) => e.id === exampleId) ?? examples[0];
        if (!ex) return;
        setParamRows(queryToRows(ex.query));
        const bodyWithAuth = ex.body != null ? injectAuthPlaceholders(ex.body, tryAuth) : null;
        setBodyJson(bodyWithAuth != null ? JSON.stringify(bodyWithAuth, null, 2) : "");
        setHeadersJson(ex.headers && Object.keys(ex.headers).length > 0 ? JSON.stringify(ex.headers, null, 2) : "{}");
    }, [exampleId, examples, tryAuth]);

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

        const bearerErr = validatePartnerBearer(bearer, pathField);
        if (bearerErr) {
            setSendErr(bearerErr);
            setTab("auth");
            return;
        }

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
    }, [bearer, collectRequestParts, pathField]);

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
                {onClose ? (
                    <button type="button" className="profile-api-try__close" onClick={onClose} title="Закрыть консоль" aria-label="Закрыть">
                        <X className="w-4 h-4" />
                    </button>
                ) : null}
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

            {autoTestPrefill ? (
                <p className="profile-api-try__hint profile-api-try__hint--autofill">
                    {pathField.includes("/api/partner/v1/")
                        ? (
                            <>
                                Один активный ключ и один ИНН — Bearer и <code>inn</code> в теле подставлены автоматически.
                                {!defaultBearer?.trim() ? " Полный токен не сохранён в сессии — вставьте его на вкладке Authorization." : null}
                            </>
                        )
                        : (
                            <>
                                Логин, пароль и ИНН подставлены из текущей сессии (<code>{'{{LOGIN}}'}</code>,{" "}
                                <code>{'{{PASSWORD}}'}</code>, <code>{'{{INN}}'}</code> во вкладке Body).
                            </>
                        )}
                </p>
            ) : null}

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
                    {bodyFieldCount > 0 ? <span className="profile-api-try__tab-badge">{bodyFieldCount}</span> : null}
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
                    <p className="profile-api-try__hint">
                        {["POST", "PUT", "PATCH"].includes(methodSel.toUpperCase()) && bodyFieldCount > 0
                            ? "Query-параметры в URL — здесь. Поля dateFrom, dateTo, inn и др. для POST — во вкладке Body."
                            : "Для GET параметры уходят в query string. Для POST с JSON-телом см. вкладку Body."}
                    </p>
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
                    {bodyRows ? (
                        <>
                            <div className="profile-api-try__table-head">
                                <span />
                                <span>Key</span>
                                <span>Value</span>
                            </div>
                            {bodyRows.map((row, i) => (
                                <div key={i} className="profile-api-try__table-row">
                                    <input
                                        type="checkbox"
                                        checked={row.enabled}
                                        onChange={(e) => {
                                            const next = [...bodyRows];
                                            next[i] = { ...row, enabled: e.target.checked };
                                            updateBodyRows(next);
                                        }}
                                    />
                                    <input
                                        className="profile-api-try__cell"
                                        value={row.key}
                                        placeholder="ключ"
                                        onChange={(e) => {
                                            const next = [...bodyRows];
                                            next[i] = { ...row, key: e.target.value };
                                            updateBodyRows(next);
                                        }}
                                    />
                                    <input
                                        className="profile-api-try__cell"
                                        value={row.value}
                                        placeholder="значение"
                                        onChange={(e) => {
                                            const next = [...bodyRows];
                                            next[i] = { ...row, value: e.target.value };
                                            updateBodyRows(next);
                                        }}
                                    />
                                </div>
                            ))}
                            <p className="profile-api-try__hint">
                                Поля JSON-тела запроса. Для Partner API: <code>dateFrom</code>, <code>dateTo</code>, <code>inn</code>,{" "}
                                <code>serviceMode</code>.
                            </p>
                        </>
                    ) : (
                        <p className="profile-api-try__warn">Невалидный JSON — исправьте в режиме Raw JSON ниже.</p>
                    )}
                    <button
                        type="button"
                        className="profile-api-try__raw-toggle"
                        onClick={() => setShowRawBodyJson((v) => !v)}
                    >
                        {showRawBodyJson ? "Скрыть Raw JSON" : "Raw JSON"}
                    </button>
                    {showRawBodyJson ? (
                        <textarea
                            className="profile-api-try__textarea profile-api-try__textarea--mono"
                            value={bodyJson}
                            onChange={(e) => setBodyJson(e.target.value)}
                            spellCheck={false}
                            rows={8}
                            placeholder="JSON тело"
                        />
                    ) : null}
                    <p className="profile-api-try__hint">
                        Плейсхолдер <code>{"{{INN}}"}</code> подставляется автоматически, если у аккаунта один доступный ИНН.
                    </p>
                </div>
            ) : null}

            {tab === "auth" ? (
                <div className="profile-api-try__panel">
                    <label className="profile-api-try__auth-label" htmlFor="profile-api-bearer">
                        Bearer-токен (полный API-ключ haulz_…)
                    </label>
                    <textarea
                        id="profile-api-bearer"
                        className="profile-api-try__textarea profile-api-try__textarea--mono"
                        value={bearer}
                        onChange={(e) => setBearer(e.target.value)}
                        rows={3}
                        placeholder="haulz_… или Bearer haulz_…"
                    />
                    <p className="profile-api-try__hint">
                        Укажите полный ключ из Профиль → API. Авторизация только через Bearer — login/password в запросах не используются.
                    </p>
                    {bearer.trim() && validatePartnerBearer(bearer, pathField) ? (
                        <p className="profile-api-try__warn">{validatePartnerBearer(bearer, pathField)}</p>
                    ) : null}
                    {!bearer.trim() && !pathField.includes("/health") ? (
                        <p className="profile-api-try__warn">
                            Префикс ключа из списка (haulz_…_) не подходит — нужен полный токен, показанный один раз при создании ключа.
                        </p>
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
                            className="profile-api-try__snippet-send"
                            onClick={() => void send()}
                            disabled={loading}
                            title="Отправить запрос"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" fill="currentColor" />}
                            <span>Send</span>
                        </button>
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
                {isPartnerV1 && !bearer.trim() && !pathField.includes("/health") ? (
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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";
import {
    buildApiCatalogNavEntries,
    getApiInventoryItem,
    MINI_APP_API_INVENTORY,
    type ApiInventoryItem,
} from "../../constants/miniAppApiInventory";
import { ProfileApiTryConsole, type ProfileTryAuth } from "./ProfileApiTryConsole";

const METHOD_STYLE: Record<string, { bg: string; fg: string }> = {
    GET: { bg: "#49cc90", fg: "#ffffff" },
    HEAD: { bg: "#9012fe", fg: "#ffffff" },
    POST: { bg: "#fca130", fg: "#1a1a1a" },
    PUT: { bg: "#fca130", fg: "#1a1a1a" },
    PATCH: { bg: "#50e3c2", fg: "#0f172a" },
    DELETE: { bg: "#f93e3e", fg: "#ffffff" },
    OPTIONS: { bg: "#9012fe", fg: "#ffffff" },
};

function parseMethods(raw: string): string[] {
    return raw
        .split(/[/,|]+/)
        .map((x) => x.trim().toUpperCase())
        .filter(Boolean);
}

function MethodBadges({ method, compact }: { method: string; compact?: boolean }) {
    const methods = parseMethods(method);
    const list = methods.length > 0 ? methods : ["GET"];
    return (
        <span className="profile-api-catalog-postman__badges" aria-hidden>
            {list.map((m) => {
                const st = METHOD_STYLE[m] ?? { bg: "#6b7280", fg: "#ffffff" };
                return (
                    <span
                        key={`${method}-${m}`}
                        className={`profile-api-catalog-postman__method-pill${compact ? " profile-api-catalog-postman__method-pill--compact" : ""}`}
                        style={{ backgroundColor: st.bg, color: st.fg }}
                    >
                        {m}
                    </span>
                );
            })}
        </span>
    );
}

type Props = {
    tryAuth: ProfileTryAuth;
    defaultBearer?: string | null;
    autoTestPrefill?: boolean;
};

/**
 * Справочник эндпоинтов в духе Postman: все методы в боковом меню, консоль теста справа.
 */
export function ProfileApiCatalogPostman({ tryAuth, defaultBearer, autoTestPrefill }: Props) {
    const navEntries = useMemo(() => buildApiCatalogNavEntries(), []);
    const firstItem = navEntries.find((e) => e.type === "item");
    const [sel, setSel] = useState<{ gi: number; ii: number } | null>(
        firstItem ? { gi: firstItem.gi, ii: firstItem.ii } : null,
    );
    const [copiedPath, setCopiedPath] = useState<string | null>(null);
    const [consoleOpen, setConsoleOpen] = useState(false);

    const selectedItem: ApiInventoryItem | null = sel ? getApiInventoryItem(sel.gi, sel.ii) : null;
    const selectedGroup = sel ? MINI_APP_API_INVENTORY[sel.gi]?.group : null;

    useEffect(() => {
        setConsoleOpen(false);
    }, [sel?.gi, sel?.ii]);

    const copyPath = useCallback((path: string) => {
        void navigator.clipboard?.writeText(path).catch(() => {});
        setCopiedPath(path);
        window.setTimeout(() => setCopiedPath((p) => (p === path ? null : p)), 1600);
    }, []);

    const selectItem = useCallback((gi: number, ii: number) => {
        setSel({ gi, ii });
    }, []);

    return (
        <div className="profile-api-catalog-postman">
            <nav className="profile-api-catalog-postman__nav" aria-label="Методы API">
                {navEntries.map((entry, idx) => {
                    if (entry.type === "group") {
                        return (
                            <div key={`group-${idx}`} className="profile-api-catalog-postman__nav-group">
                                {entry.label}
                            </div>
                        );
                    }
                    const isActive = sel?.gi === entry.gi && sel?.ii === entry.ii;
                    return (
                        <button
                            key={`nav-${entry.gi}-${entry.ii}`}
                            type="button"
                            className={`profile-api-catalog-postman__nav-item${isActive ? " is-active" : ""}`}
                            onClick={() => selectItem(entry.gi, entry.ii)}
                            title={`${entry.method} ${entry.path}`}
                        >
                            <MethodBadges method={entry.method} compact />
                            <span className="profile-api-catalog-postman__nav-label">{entry.navLabel}</span>
                        </button>
                    );
                })}
            </nav>
            <div className="profile-api-catalog-postman__main">
                {!selectedItem ? (
                    <p className="profile-api-catalog-postman__empty">Выберите метод в меню слева.</p>
                ) : (
                    <>
                        <div className="profile-api-catalog-postman__main-head">
                            <div>
                                <p className="profile-api-catalog-postman__main-group">{selectedGroup}</p>
                                <h3 className="profile-api-catalog-postman__main-title">{selectedItem.navLabel}</h3>
                            </div>
                        </div>
                        <div className="profile-api-catalog-postman__detail">
                            <div className="profile-api-catalog-postman__row-top">
                                <MethodBadges method={selectedItem.method} />
                                <code className="profile-api-catalog-postman__path">{selectedItem.path}</code>
                                <button
                                    type="button"
                                    className="profile-api-catalog-postman__copy"
                                    title="Копировать путь"
                                    aria-label={`Копировать ${selectedItem.path}`}
                                    onClick={() => copyPath(selectedItem.path)}
                                >
                                    {copiedPath === selectedItem.path ? (
                                        <Check className="profile-api-catalog-postman__copy-icon" strokeWidth={2.5} />
                                    ) : (
                                        <Copy className="profile-api-catalog-postman__copy-icon" strokeWidth={2} />
                                    )}
                                </button>
                            </div>
                            <p className="profile-api-catalog-postman__desc">{selectedItem.note}</p>
                            <div className="profile-api-catalog-postman__item-actions">
                                <button
                                    type="button"
                                    className="profile-api-catalog-postman__try-btn"
                                    onClick={() => setConsoleOpen((v) => !v)}
                                >
                                    {consoleOpen ? "Свернуть консоль" : "Тест запроса"}
                                </button>
                            </div>
                            {consoleOpen && sel ? (
                                <ProfileApiTryConsole
                                    key={`profile-api-try-${sel.gi}-${sel.ii}`}
                                    item={selectedItem}
                                    tryAuth={tryAuth}
                                    defaultBearer={defaultBearer}
                                    autoTestPrefill={autoTestPrefill}
                                    onClose={() => setConsoleOpen(false)}
                                />
                            ) : null}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

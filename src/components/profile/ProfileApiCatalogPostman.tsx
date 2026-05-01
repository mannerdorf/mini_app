import React, { useCallback, useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { MINI_APP_API_INVENTORY } from "../../constants/miniAppApiInventory";
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

function MethodBadges({ method }: { method: string }) {
    const methods = parseMethods(method);
    const list = methods.length > 0 ? methods : ["GET"];
    return (
        <span className="profile-api-catalog-postman__badges" aria-hidden>
            {list.map((m) => {
                const st = METHOD_STYLE[m] ?? { bg: "#6b7280", fg: "#ffffff" };
                return (
                    <span
                        key={`${method}-${m}`}
                        className="profile-api-catalog-postman__method-pill"
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
};

/**
 * Справочник эндпоинтов в духе Postman: группы, список, копирование пути, консоль теста запроса.
 */
export function ProfileApiCatalogPostman({ tryAuth }: Props) {
    const [sectionIdx, setSectionIdx] = useState(0);
    const [copiedPath, setCopiedPath] = useState<string | null>(null);
    const [sel, setSel] = useState<{ gi: number; ii: number } | null>(null);

    const section = MINI_APP_API_INVENTORY[sectionIdx] ?? MINI_APP_API_INVENTORY[0];

    useEffect(() => {
        setSel(null);
    }, [sectionIdx]);

    const copyPath = useCallback((path: string) => {
        void navigator.clipboard?.writeText(path).catch(() => {});
        setCopiedPath(path);
        window.setTimeout(() => setCopiedPath((p) => (p === path ? null : p)), 1600);
    }, []);

    return (
        <div className="profile-api-catalog-postman">
            <nav className="profile-api-catalog-postman__nav" aria-label="Группы запросов">
                {MINI_APP_API_INVENTORY.map((s, i) => (
                    <button
                        key={s.group}
                        type="button"
                        className={`profile-api-catalog-postman__nav-btn${i === sectionIdx ? " is-active" : ""}`}
                        onClick={() => setSectionIdx(i)}
                    >
                        {s.group}
                    </button>
                ))}
            </nav>
            <div className="profile-api-catalog-postman__main">
                <div className="profile-api-catalog-postman__main-head">
                    <h3 className="profile-api-catalog-postman__main-title">{section.group}</h3>
                    <span className="profile-api-catalog-postman__count">{section.items.length} запросов</span>
                </div>
                <ul className="profile-api-catalog-postman__list" role="list">
                    {section.items.map((it, ii) => {
                        const isOpen = sel?.gi === sectionIdx && sel?.ii === ii;
                        return (
                            <li
                                key={`${it.method}-${it.path}-${ii}`}
                                className={`profile-api-catalog-postman__item${isOpen ? " is-open" : ""}`}
                            >
                                <div className="profile-api-catalog-postman__row-top">
                                    <MethodBadges method={it.method} />
                                    <code className="profile-api-catalog-postman__path">{it.path}</code>
                                    <button
                                        type="button"
                                        className="profile-api-catalog-postman__copy"
                                        title="Копировать путь"
                                        aria-label={`Копировать ${it.path}`}
                                        onClick={() => copyPath(it.path)}
                                    >
                                        {copiedPath === it.path ? (
                                            <Check className="profile-api-catalog-postman__copy-icon" strokeWidth={2.5} />
                                        ) : (
                                            <Copy className="profile-api-catalog-postman__copy-icon" strokeWidth={2} />
                                        )}
                                    </button>
                                </div>
                                <p className="profile-api-catalog-postman__desc">{it.note}</p>
                                <div className="profile-api-catalog-postman__item-actions">
                                    <button
                                        type="button"
                                        className="profile-api-catalog-postman__try-btn"
                                        onClick={() => setSel(isOpen ? null : { gi: sectionIdx, ii })}
                                    >
                                        {isOpen ? "Свернуть консоль" : "Тест запроса"}
                                    </button>
                                </div>
                                {isOpen ? (
                                    <ProfileApiTryConsole
                                        key={`${it.path}-${it.method}`}
                                        item={it}
                                        tryAuth={tryAuth}
                                        onClose={() => setSel(null)}
                                    />
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}

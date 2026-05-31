import React, { useCallback, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Panel, Typography } from "@maxhub/max-ui";
import { USER_API_KEY_SCOPE_INFO_RU, USER_API_KEY_SCOPES_CLIENT } from "../../constants/userApiKeyScopesClient";
import { PARTNER_API_GUIDE_SECTIONS, type PartnerApiGuideSection } from "../../pages/profile/partnerApiGuideContent";

function GuideTable({ headers, rows }: { headers: string[]; rows: { cells: string[] }[] }) {
    return (
        <div className="profile-partner-api-guide__table-wrap">
            <table className="profile-partner-api-guide__table">
                <thead>
                    <tr>
                        {headers.map((h) => (
                            <th key={h}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, idx) => (
                        <tr key={idx}>
                            {row.cells.map((cell, ci) => (
                                <td key={ci}>
                                    {ci === 1 && headers.length >= 2 && cell.startsWith("/api/") ? <code>{cell}</code> : cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function GuideSectionBlock({ section }: { section: PartnerApiGuideSection }) {
    const [copied, setCopied] = useState(false);

    const copyCode = useCallback((text: string) => {
        void navigator.clipboard?.writeText(text).catch(() => {});
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    }, []);

    return (
        <Panel className="cargo-card profile-partner-api-guide__section" style={{ padding: "1rem" }}>
            <Typography.Body style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.35rem" }}>{section.title}</Typography.Body>
            {section.intro ? (
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                    {section.intro}
                </Typography.Body>
            ) : null}
            {section.code ? (
                <div className="profile-partner-api-guide__code-row">
                    <pre className="profile-partner-api-guide__code">{section.code}</pre>
                    <button
                        type="button"
                        className="profile-api-keys-copy-inline"
                        title="Копировать"
                        aria-label="Копировать пример"
                        onClick={() => copyCode(section.code!)}
                    >
                        {copied ? <Check className="w-4 h-4" strokeWidth={2.5} /> : <Copy className="w-4 h-4" strokeWidth={2} />}
                    </button>
                </div>
            ) : null}
            {section.steps && section.steps.length > 0 ? (
                <ol className="profile-partner-api-guide__list">
                    {section.steps.map((step, idx) => (
                        <li key={idx}>
                            <Typography.Body style={{ fontSize: "0.85rem" }}>{step}</Typography.Body>
                        </li>
                    ))}
                </ol>
            ) : null}
            {section.bullets && section.bullets.length > 0 ? (
                <ul className="profile-partner-api-guide__list">
                    {section.bullets.map((bullet, idx) => (
                        <li key={idx}>
                            <Typography.Body style={{ fontSize: "0.85rem" }}>{bullet}</Typography.Body>
                        </li>
                    ))}
                </ul>
            ) : null}
            {section.tableHeaders && section.tableRows ? (
                <GuideTable headers={section.tableHeaders} rows={section.tableRows} />
            ) : null}
            {section.footnote ? (
                <Typography.Body style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginTop: "0.45rem" }}>
                    {section.footnote}
                </Typography.Body>
            ) : null}
        </Panel>
    );
}

/** Описание Partner API v1 для раздела Профиль → API. */
export function ProfilePartnerApiGuide() {
    return (
        <div className="profile-partner-api-guide">
            <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.75rem" }}>
                Краткое руководство по интеграции: авторизация, методы, форматы запросов и ошибки.
            </Typography.Body>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {PARTNER_API_GUIDE_SECTIONS.map((section) => (
                    <GuideSectionBlock key={section.id} section={section} />
                ))}
                <Panel className="cargo-card profile-partner-api-guide__section" style={{ padding: "1rem" }}>
                    <Typography.Body style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                        Права (scope) на ключе
                    </Typography.Body>
                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.5rem" }}>
                        При создании или редактировании ключа отметьте нужные права. Без scope запрос к методу будет отклонён.
                    </Typography.Body>
                    <GuideTable
                        headers={["Scope", "Метод", "Описание"]}
                        rows={USER_API_KEY_SCOPES_CLIENT.map((scope) => {
                            const info = USER_API_KEY_SCOPE_INFO_RU[scope];
                            return { cells: [scope, info.apiHint, info.title] };
                        })}
                    />
                </Panel>
            </div>
        </div>
    );
}

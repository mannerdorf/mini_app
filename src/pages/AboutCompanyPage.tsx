import React from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { ArrowLeft, Share2, MapPin, Phone, Mail } from "lucide-react";
import { ABOUT_HAULZ_TEXT } from "../constants/legalTexts";
import { HAULZ_OFFICES, HAULZ_EMAIL } from "../constants/brand";

type Props = {
    onBack: () => void;
};

export function AboutCompanyPage({ onBack }: Props) {
    const normalizePhoneToTel = (phone: string) => {
        const digits = phone.replace(/[^\d+]/g, "");
        return digits.startsWith("+") ? digits : `+${digits}`;
    };

    const getMapsUrl = (address: string) => {
        const q = encodeURIComponent(address);
        return `https://yandex.ru/maps/?text=${q}`;
    };

    const shareText = async (title: string, text: string) => {
        try {
            if (typeof navigator !== "undefined" && (navigator as any).share) {
                await (navigator as any).share({ title, text });
                return;
            }
        } catch {
            // ignore
        }
        try {
            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                alert("Скопировано");
                return;
            }
        } catch {
            // ignore
        }
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            alert("Скопировано");
        } catch {
            alert(text);
        }
    };

    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: "1.25rem" }}>О компании</Typography.Headline>
            </Flex>

            <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                <Typography.Body style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: "0.95rem" }}>
                    {ABOUT_HAULZ_TEXT}
                </Typography.Body>
            </Panel>

            <Typography.Body style={{ marginBottom: "0.75rem", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                Контакты
            </Typography.Body>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "0.75rem" }}>
                {HAULZ_OFFICES.map((office) => (
                    <Panel key={office.city} className="cargo-card" style={{ padding: "1rem" }}>
                        <Flex align="center" justify="space-between" style={{ marginBottom: "0.5rem", gap: "0.5rem" }}>
                            <Typography.Body style={{ fontSize: "0.95rem", fontWeight: 600 }}>{office.city}</Typography.Body>
                            <Button
                                className="filter-button"
                                type="button"
                                title="Поделиться"
                                aria-label="Поделиться"
                                style={{ padding: "0.25rem 0.5rem", minWidth: "auto" }}
                                onClick={() => {
                                    const text = `HAULZ — ${office.city}\nАдрес: ${office.address}\nТел.: ${office.phone}\nEmail: ${HAULZ_EMAIL}`;
                                    shareText(`HAULZ — ${office.city}`, text);
                                }}
                            >
                                <Share2 className="w-4 h-4" />
                            </Button>
                        </Flex>
                        <a
                            className="filter-button"
                            href={getMapsUrl(`${office.city}, ${office.address}`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                width: "100%",
                                justifyContent: "flex-start",
                                gap: "0.5rem",
                                padding: "0.5rem 0.75rem",
                                marginBottom: "0.5rem",
                                backgroundColor: "transparent",
                                textDecoration: "none",
                            }}
                            title="Открыть маршрут"
                        >
                            <MapPin className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                            <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                                {office.address}
                            </Typography.Body>
                        </a>
                        <a
                            className="filter-button"
                            href={`tel:${normalizePhoneToTel(office.phone)}`}
                            style={{
                                width: "100%",
                                justifyContent: "flex-start",
                                gap: "0.5rem",
                                padding: "0.5rem 0.75rem",
                                backgroundColor: "transparent",
                                textDecoration: "none",
                            }}
                            title="Позвонить"
                        >
                            <Phone className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                            <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                                {office.phone}
                            </Typography.Body>
                        </a>
                    </Panel>
                ))}
            </div>

            <Panel className="cargo-card" style={{ padding: "1rem" }}>
                <Flex align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                    <a
                        className="filter-button"
                        href={`mailto:${HAULZ_EMAIL}`}
                        style={{
                            width: "100%",
                            justifyContent: "flex-start",
                            gap: "0.5rem",
                            padding: "0.5rem 0.75rem",
                            backgroundColor: "transparent",
                            textDecoration: "none",
                            marginRight: "0.5rem",
                        }}
                        title="Написать письмо"
                    >
                        <Mail className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
                        <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                            {HAULZ_EMAIL}
                        </Typography.Body>
                    </a>
                    <Button
                        className="filter-button"
                        type="button"
                        title="Поделиться"
                        aria-label="Поделиться"
                        style={{ padding: "0.25rem 0.5rem", minWidth: "auto", flexShrink: 0 }}
                        onClick={() => {
                            const text = `HAULZ\nEmail: ${HAULZ_EMAIL}\nТел.: ${HAULZ_OFFICES.map((o) => `${o.city}: ${o.phone}`).join(" | ")}`;
                            shareText("HAULZ — контакты", text);
                        }}
                    >
                        <Share2 className="w-4 h-4" />
                    </Button>
                </Flex>
            </Panel>
        </div>
    );
}

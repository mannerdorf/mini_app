import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { PROFILE_FAQ_ITEMS } from "../../pages/profile/faqContent";

type Props = {
    onBack: () => void;
};

/** Экран FAQ в профиле (список вопросов из `faqContent`). */
export function ProfileFaqSection({ onBack }: Props) {
    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: "0.5rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: "1.25rem" }}>FAQ</Typography.Headline>
            </Flex>
            <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
                Подробные ответы: вход и пароль, присоединение компаний (по ИНН и по логину/паролю), приглашение и управление сотрудниками, грузы, фильтры, документы и поддержка.
            </Typography.Body>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {PROFILE_FAQ_ITEMS.map((item, idx) => (
                    <Panel
                        key={`${item.q}-${idx}`}
                        className="cargo-card"
                        style={{
                            padding: "1rem",
                            display: "flex",
                            gap: "0.75rem",
                            alignItems: "flex-start",
                        }}
                    >
                        <img
                            src={item.img}
                            alt={item.alt}
                            style={{ width: "44px", height: "44px", borderRadius: "10px", objectFit: "cover", flexShrink: 0 }}
                            loading="lazy"
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                            <Typography.Body style={{ fontSize: "0.9rem", fontWeight: 600 }}>{item.q}</Typography.Body>
                            <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>{item.a}</Typography.Body>
                        </div>
                    </Panel>
                ))}
            </div>
        </div>
    );
}

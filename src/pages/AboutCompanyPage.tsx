import React from "react";
import { Button, Flex, Panel, Typography } from "@maxhub/max-ui";
import { ArrowLeft } from "lucide-react";
import { HaulzWarehousePanel } from "../components/haulz/HaulzWarehousePanel";
import { HAULZ_WEBSITE_URL } from "../constants/brand";
import { ABOUT_HAULZ_TEXT } from "../constants/legalTexts";
import { GUEST_WAREHOUSE_ITEMS } from "./guest/guestWarehouseContent";

type Props = {
    onBack: () => void;
    /** Подпись email в UI (без домена в гостевой зоне). */
    emailLabel?: string;
    showWarehouses?: boolean;
};

export function AboutCompanyPage({ onBack, emailLabel, showWarehouses = true }: Props) {
    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline className="text-page-title">О компании</Typography.Headline>
            </Flex>

            <Panel className="cargo-card" style={{ padding: "1rem", marginBottom: "1rem" }}>
                <Typography.Body style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: "0.95rem" }}>
                    {ABOUT_HAULZ_TEXT}
                </Typography.Body>
            </Panel>

            {showWarehouses ? (
                <>
                    <Typography.Body style={{ marginBottom: "0.75rem", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                        Склады HAULZ
                    </Typography.Body>

                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "0.75rem" }}>
                        {GUEST_WAREHOUSE_ITEMS.map((warehouse) => (
                            <HaulzWarehousePanel
                                key={warehouse.city}
                                {...warehouse}
                                emailLabel={emailLabel}
                                websiteUrl={HAULZ_WEBSITE_URL}
                            />
                        ))}
                    </div>
                </>
            ) : null}
        </div>
    );
}

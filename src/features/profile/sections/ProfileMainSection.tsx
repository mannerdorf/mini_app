import React, { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
    Bell,
    Building2,
    FileText,
    Info,
    Key,
    LayoutGrid,
    MessageCircle,
    Mic,
    ScanBarcode,
    Shield,
    User as UserIcon,
    Users,
} from "lucide-react";
import { Flex, Panel, Typography } from "@maxhub/max-ui";
import type { Account, ProfileView } from "../../../types";
import { formatDateTime } from "../../../lib/dateUtils";
import { ProfilePasswordSection } from "../../../components/profile/ProfilePasswordSection";
import { cargoListContainerVariants, cargoListItemVariants, cargoSummaryMotion } from "../../../pages/cargoMotion";
import type { ProfileMainState } from "../hooks/useProfileMain";

type Props = {
    activeAccount: Account | null;
    activeAccountId: string | null;
    profileSaasShellActive: boolean;
    onNavigate: (view: ProfileView) => void;
    onOpenOffer: () => void;
    onOpenPersonalConsent: () => void;
    onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
    main: ProfileMainState;
};

export function ProfileMainSection({
    activeAccount,
    activeAccountId,
    profileSaasShellActive,
    onNavigate,
    onOpenOffer,
    onOpenPersonalConsent,
    onUpdateAccount,
    main,
}: Props) {
    const { legalStatus } = main;
    const prefersReducedMotion = useReducedMotion();
    const profileMotionEnabled = prefersReducedMotion !== true;
    const shellMotion = profileSaasShellActive && profileMotionEnabled;

    const settingsItems = useMemo(() => [
        {
            id: "companies",
            label: "Мои компании",
            icon: <Building2 className="w-5 h-5" style={{ color: "var(--color-primary)" }} />,
            onClick: () => onNavigate("companies"),
        },
        {
            id: "roles",
            label: "Роли",
            icon: <UserIcon className="w-5 h-5" style={{ color: "var(--color-primary)" }} />,
            onClick: () => onNavigate("roles"),
        },
        {
            id: "parcelScanner",
            label: "Сканер посылки",
            icon: <ScanBarcode className="w-5 h-5" style={{ color: "var(--color-primary)" }} />,
            onClick: () => onNavigate("parcelScanner"),
        },
        ...((activeAccount?.isSuperAdmin || activeAccount?.permissions?.haulz === true) ? [{
            id: "haulz",
            label: "HAULZ",
            icon: <LayoutGrid className="w-5 h-5" style={{ color: "var(--color-primary)" }} />,
            onClick: () => onNavigate("haulz"),
        }] : []),
        ...(activeAccount?.isRegisteredUser && activeAccount?.inCustomerDirectory === true ? [
            ...(activeAccount?.permissions?.supervisor === true ? [{
                id: "employees",
                label: "Справочник сотрудников",
                icon: <Users className="w-5 h-5" style={{ color: "var(--color-primary)" }} />,
                onClick: () => onNavigate("employees"),
            }] : []),
        ] : []),
        ...(activeAccount?.isRegisteredUser === true && activeAccount?.permissions?.service_mode === true
            ? [{
                id: "voiceAssistants",
                label: "Голосовые помощники",
                icon: <Mic className="w-5 h-5" style={{ color: "var(--color-primary)" }} />,
                onClick: () => onNavigate("voiceAssistants"),
            }]
            : []),
        {
            id: "notifications",
            label: "Уведомления",
            icon: <Bell className="w-5 h-5" style={{ color: "var(--color-primary)" }} />,
            onClick: () => onNavigate("notifications"),
        },
        ...(activeAccount?.isRegisteredUser === true
            ? [{
                id: "apiKeys" as const,
                label: "API",
                icon: <Key className="w-5 h-5" style={{ color: "var(--color-primary)" }} />,
                onClick: () => onNavigate("apiKeys"),
            }]
            : []),
    ], [activeAccount, onNavigate]);

    const infoItems = useMemo(() => [
        {
            id: "about",
            label: "О компании",
            icon: <Info className="w-5 h-5" style={{ color: "var(--color-primary)" }} />,
            onClick: () => onNavigate("about"),
        },
        {
            id: "faq",
            label: "FAQ",
            icon: <MessageCircle className="w-5 h-5" style={{ color: "var(--color-primary)" }} />,
            onClick: () => onNavigate("faq"),
        },
        {
            id: "offer",
            label: "Публичная оферта",
            icon: <FileText className="w-5 h-5" style={{ color: "var(--color-primary)" }} />,
            onClick: onOpenOffer,
        },
        {
            id: "consent",
            label: "Согласие на обработку персональных данных",
            icon: <Shield className="w-5 h-5" style={{ color: "var(--color-primary)" }} />,
            onClick: onOpenPersonalConsent,
        },
    ], [onNavigate, onOpenOffer, onOpenPersonalConsent]);

    return (
        <div className={profileSaasShellActive ? "w-full profile-saas-layout profile-saas-layout--analytics" : "w-full"}>
            <motion.div {...(shellMotion ? cargoSummaryMotion : { initial: false })}>
                <header className={profileSaasShellActive ? "profile-saas-page-header" : "profile-saas-page-header profile-saas-page-header--legacy"}>
                    <div className="profile-saas-page-header-text">
                        <h1 className="profile-saas-h1">Профиль</h1>
                        {!activeAccount ? (
                            <p className="profile-saas-caption">Выберите компанию в шапке</p>
                        ) : null}
                    </div>
                </header>
            </motion.div>

            <section className="profile-saas-section" aria-labelledby="profile-settings-heading">
                <motion.h2
                    id="profile-settings-heading"
                    className="profile-saas-h2"
                    {...(shellMotion ? cargoSummaryMotion : { initial: false })}
                >
                    Настройки
                </motion.h2>
                <motion.div
                    className="profile-saas-stack"
                    variants={shellMotion ? cargoListContainerVariants : undefined}
                    initial={shellMotion ? "hidden" : false}
                    animate={shellMotion ? "visible" : undefined}
                >
                    {settingsItems.map((item) => (
                        <motion.div
                            key={item.id}
                            variants={shellMotion ? cargoListItemVariants : undefined}
                            initial={shellMotion ? "hidden" : false}
                            animate={shellMotion ? "visible" : undefined}
                        >
                            <Panel
                                className="cargo-card profile-saas-row-card"
                                onClick={item.onClick}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    padding: "1rem",
                                    cursor: "pointer",
                                }}
                            >
                                <Flex align="center" style={{ flex: 1, gap: "0.75rem" }}>
                                    <div className="profile-saas-row-icon">{item.icon}</div>
                                    <Typography.Body className="profile-saas-body" style={{ fontSize: "0.9rem" }}>{item.label}</Typography.Body>
                                </Flex>
                            </Panel>
                        </motion.div>
                    ))}
                </motion.div>
            </section>

            <section className="profile-saas-section" aria-labelledby="profile-security-heading">
                <motion.h2
                    id="profile-security-heading"
                    className="profile-saas-h2"
                    {...(shellMotion ? cargoSummaryMotion : { initial: false })}
                >
                    Безопасность
                </motion.h2>
                <motion.div
                    className="profile-saas-stack"
                    variants={shellMotion ? cargoListContainerVariants : undefined}
                    initial={shellMotion ? "hidden" : false}
                    animate={shellMotion ? "visible" : undefined}
                >
                    {activeAccountId && activeAccount && (
                        <motion.div
                            variants={shellMotion ? cargoListItemVariants : undefined}
                            initial={shellMotion ? "hidden" : false}
                            animate={shellMotion ? "visible" : undefined}
                        >
                            <Panel
                                className="cargo-card profile-saas-row-card"
                                onClick={() => onNavigate("2fa")}
                                style={{ display: "flex", alignItems: "center", padding: "1rem", cursor: "pointer" }}
                            >
                                <Flex align="center" style={{ flex: 1, gap: "0.75rem" }}>
                                    <div className="profile-saas-row-icon">
                                        <Shield className="w-5 h-5" />
                                    </div>
                                    <Typography.Body className="profile-saas-body" style={{ fontSize: "0.9rem" }}>Двухфакторная аутентификация (2FA)</Typography.Body>
                                </Flex>
                            </Panel>
                        </motion.div>
                    )}
                    {activeAccountId && activeAccount?.isRegisteredUser && activeAccount && (
                        <motion.div
                            variants={shellMotion ? cargoListItemVariants : undefined}
                            initial={shellMotion ? "hidden" : false}
                            animate={shellMotion ? "visible" : undefined}
                        >
                            <ProfilePasswordSection
                                activeAccount={activeAccount}
                                activeAccountId={activeAccountId}
                                onUpdateAccount={onUpdateAccount}
                            />
                        </motion.div>
                    )}
                </motion.div>
            </section>

            <section className="profile-saas-section" aria-labelledby="profile-info-heading">
                <motion.h2
                    id="profile-info-heading"
                    className="profile-saas-h2"
                    {...(shellMotion ? cargoSummaryMotion : { initial: false })}
                >
                    Информация
                </motion.h2>
                <motion.div
                    className="profile-saas-stack"
                    variants={shellMotion ? cargoListContainerVariants : undefined}
                    initial={shellMotion ? "hidden" : false}
                    animate={shellMotion ? "visible" : undefined}
                >
                    {infoItems.map((item) => {
                        const accepted =
                            item.id === "offer"
                                ? legalStatus?.accepted?.offer
                                : item.id === "consent"
                                    ? legalStatus?.accepted?.consent
                                    : null;
                        const acceptedAt = accepted?.accepted_at
                            ? formatDateTime(accepted.accepted_at)
                            : null;
                        return (
                            <motion.div
                                key={item.id}
                                variants={shellMotion ? cargoListItemVariants : undefined}
                                initial={shellMotion ? "hidden" : false}
                                animate={shellMotion ? "visible" : undefined}
                            >
                                <Panel
                                    className={`cargo-card profile-saas-row-card${item.id === "offer" || item.id === "consent" ? " profile-saas-row-card--legal" : ""}`}
                                    onClick={item.onClick}
                                    style={{
                                        display: "flex",
                                        alignItems: item.id === "offer" || item.id === "consent" ? "flex-start" : "center",
                                        padding: "1rem",
                                        cursor: "pointer",
                                    }}
                                >
                                    <Flex
                                        align={item.id === "offer" || item.id === "consent" ? "flex-start" : "center"}
                                        style={{ flex: 1, gap: "0.75rem", minWidth: 0 }}
                                    >
                                        <div className="profile-saas-row-icon">{item.icon}</div>
                                        <div className="profile-saas-row-text">
                                            <Typography.Body
                                                component="div"
                                                className="profile-saas-body profile-saas-row-title"
                                                style={{ fontSize: "0.9rem" }}
                                            >
                                                {item.label}
                                            </Typography.Body>
                                            {(item.id === "offer" || item.id === "consent") && (
                                                <Typography.Body
                                                    component="div"
                                                    className="profile-saas-caption profile-saas-legal-accepted"
                                                >
                                                    {acceptedAt && accepted?.version_label
                                                        ? `Принято ${acceptedAt}, ред. ${accepted.version_label}`
                                                        : "Принятие не зафиксировано"}
                                                </Typography.Body>
                                            )}
                                        </div>
                                    </Flex>
                                </Panel>
                            </motion.div>
                        );
                    })}
                </motion.div>
            </section>
        </div>
    );
}

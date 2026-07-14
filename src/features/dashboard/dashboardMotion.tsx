import React from "react";
import { motion, MotionConfig } from "motion/react";

export const DASHBOARD_MOTION_CONTAINER = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.055, delayChildren: 0.05 },
    },
};

export const DASHBOARD_MOTION_ITEM = {
    hidden: { opacity: 0, y: 14 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { type: "spring", stiffness: 380, damping: 30 },
    },
};

export function DashboardMotionGroup({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
    if (!enabled) return <>{children}</>;
    return (
        <MotionConfig reduced="user">
            <motion.div
                variants={DASHBOARD_MOTION_CONTAINER}
                initial="hidden"
                animate="visible"
                style={{ display: "flex", flexDirection: "column", width: "100%", gap: 0 }}
            >
                {children}
            </motion.div>
        </MotionConfig>
    );
}

export function DashboardMotionItem({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
    if (!enabled) return <>{children}</>;
    return (
        <motion.div variants={DASHBOARD_MOTION_ITEM} style={{ width: "100%" }}>
            {children}
        </motion.div>
    );
}

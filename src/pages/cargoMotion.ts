/** Общие параметры Motion для экрана «Грузы» (см. prefers-reduced-motion в компонентах). */
export const CARGO_MOTION_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const cargoSummaryMotion = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.34, ease: CARGO_MOTION_EASE },
};

export const cargoModeSwitchMotion = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2, ease: CARGO_MOTION_EASE },
};

export const cargoListContainerVariants = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.042, delayChildren: 0.03 },
    },
};

export const cargoListItemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.28, ease: CARGO_MOTION_EASE },
    },
};

/** Строки-агрегаты по заказчику: stagger через custom = индекс строки */
export const cargoTableGroupRowVariants = {
    initial: { opacity: 0, x: -10 },
    animate: (i: number) => ({
        opacity: 1,
        x: 0,
        transition: {
            delay: Math.min(i * 0.032, 0.38),
            duration: 0.26,
            ease: CARGO_MOTION_EASE,
        },
    }),
};

export const cargoExpandMotionProps = {
    initial: { opacity: 0, y: -6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, ease: CARGO_MOTION_EASE },
};

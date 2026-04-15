import React from "react";

export type TapSwitchVariant = "default" | "comfortable";

type TapSwitchProps = {
    checked: boolean;
    onToggle: () => void;
    /** Крупный iOS-подобный трек (макет профиля Figma): 52×30, пружинная кривая. */
    variant?: TapSwitchVariant;
    "aria-label"?: string;
};

/** Общий переключатель (2FA, уведомления, таблицы). Вариант `comfortable` — для «Новый стиль профиля». */
export function TapSwitch({ checked, onToggle, variant = "default", "aria-label": ariaLabel }: TapSwitchProps) {
    const lastToggleAtRef = React.useRef(0);
    const toggle = () => {
        const now = Date.now();
        if (now - lastToggleAtRef.current < 250) return;
        lastToggleAtRef.current = now;
        onToggle();
    };

    if (variant === "comfortable") {
        return (
            <button
                type="button"
                className="tap-switch tap-switch--comfortable"
                aria-pressed={checked}
                aria-label={ariaLabel}
                onClick={toggle}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggle();
                    }
                }}
            >
                <span className="tap-switch__thumb" aria-hidden />
            </button>
        );
    }

    return (
        <button
            type="button"
            aria-pressed={checked}
            aria-label={ariaLabel}
            onClick={toggle}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle();
                }
            }}
            style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                background: checked ? "var(--color-theme-primary, #2563eb)" : "var(--color-border, #ccc)",
                position: "relative",
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 0.2s",
                border: "none",
                outline: "none",
                padding: 0,
                touchAction: "manipulation",
                pointerEvents: "auto",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    top: 2,
                    left: checked ? 22 : 2,
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    transition: "left 0.2s",
                }}
            />
        </button>
    );
}

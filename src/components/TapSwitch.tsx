import React from "react";

/** Общий переключатель (как в 2FA) — для Уведомлений и 2FA. */
export function TapSwitch({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
    const lastToggleAtRef = React.useRef(0);
    const toggle = () => {
        const now = Date.now();
        if (now - lastToggleAtRef.current < 220) return;
        lastToggleAtRef.current = now;
        onToggle();
    };
    return (
        <button
            type="button"
            aria-pressed={checked}
            onClick={toggle}
            onPointerUp={toggle}
            onTouchEnd={toggle}
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

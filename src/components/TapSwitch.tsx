import React from "react";
import "./tapSwitch.css";

export type TapSwitchVariant = "default" | "comfortable";
type TapSwitchProps = {
    checked: boolean;
    onToggle: () => void;
    variant?: TapSwitchVariant;
    "aria-label": string;
    disabled?: boolean;
};

/** Both track sizes retain a 44px touch target and native keyboard activation. */
export function TapSwitch({ checked, onToggle, variant = "default", "aria-label": ariaLabel, disabled = false }: TapSwitchProps) {
    return (
        <button type="button" className={`tap-switch tap-switch--${variant}`}
            role="switch" aria-checked={checked} aria-label={ariaLabel} disabled={disabled}
            onClick={() => { if (!disabled) onToggle(); }}>
            <span className="tap-switch__thumb" aria-hidden="true" />
        </button>
    );
}

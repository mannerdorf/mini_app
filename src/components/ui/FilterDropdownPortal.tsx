import React, { useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

type FilterDropdownPortalProps = {
    triggerRef: React.RefObject<HTMLElement | null>;
    isOpen: boolean;
    children: React.ReactNode;
};

export function FilterDropdownPortal({ triggerRef, isOpen, children }: FilterDropdownPortalProps) {
    const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
    useLayoutEffect(() => {
        if (!isOpen || !triggerRef.current) {
            setRect(null);
            return;
        }
        const el = triggerRef.current;
        const r = el.getBoundingClientRect();
        setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 160) });
    }, [isOpen, triggerRef]);
    if (!isOpen || !rect || typeof document === 'undefined') return null;
    return createPortal(
        <div className="filter-dropdown filter-dropdown-portal" style={{ top: rect.top, left: rect.left, minWidth: rect.width }}>
            {children}
        </div>,
        document.body
    );
}

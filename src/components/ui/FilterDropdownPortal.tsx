import React, { useState, useLayoutEffect, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

type FilterDropdownPortalProps = {
    triggerRef: React.RefObject<HTMLElement | null>;
    isOpen: boolean;
    onClose?: () => void;
    children: React.ReactNode;
};

export function FilterDropdownPortal({ triggerRef, isOpen, onClose, children }: FilterDropdownPortalProps) {
    const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        if (!isOpen || !triggerRef.current) {
            setRect(null);
            return;
        }
        const el = triggerRef.current;
        const r = el.getBoundingClientRect();
        setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 160) });
    }, [isOpen, triggerRef]);

    useEffect(() => {
        if (!isOpen || !onClose) return;
        const handleMouseDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (triggerRef.current?.contains(target)) return;
            if (containerRef.current?.contains(target)) return;
            onClose();
        };
        const handlePointerDown = (e: PointerEvent) => {
            const target = e.target as Node;
            if (triggerRef.current?.contains(target)) return;
            if (containerRef.current?.contains(target)) return;
            onClose();
        };
        const t = setTimeout(() => {
            document.addEventListener("mousedown", handleMouseDown);
            document.addEventListener("pointerdown", handlePointerDown);
        }, 80);
        return () => {
            clearTimeout(t);
            document.removeEventListener("mousedown", handleMouseDown);
            document.removeEventListener("pointerdown", handlePointerDown);
        };
    }, [isOpen, onClose, triggerRef]);

    if (!isOpen || !rect || typeof document === "undefined") return null;
    return createPortal(
        <div ref={containerRef} className="filter-dropdown filter-dropdown-portal" style={{ top: rect.top, left: rect.left, minWidth: rect.width }}>
            {children}
        </div>,
        document.body
    );
}

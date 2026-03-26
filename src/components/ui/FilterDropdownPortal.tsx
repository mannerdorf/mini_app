import React, { useState, useLayoutEffect, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

type FilterDropdownPortalProps = {
    triggerRef: React.RefObject<HTMLElement | null>;
    isOpen: boolean;
    onClose?: () => void;
    children: React.ReactNode;
};

export function FilterDropdownPortal({ triggerRef, isOpen, onClose, children }: FilterDropdownPortalProps) {
    const [rect, setRect] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const ignoreNextOutsideRef = useRef(false);

    useLayoutEffect(() => {
        if (!isOpen || !triggerRef.current) {
            setRect(null);
            return;
        }
        const updatePosition = () => {
            if (!triggerRef.current) return;
            const el = triggerRef.current;
            const r = el.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const margin = 8;
            const gap = 4;
            const desiredMaxHeight = Math.floor(viewportHeight * 0.7);
            const spaceBelow = Math.max(0, viewportHeight - r.bottom - margin - gap);
            const spaceAbove = Math.max(0, r.top - margin - gap);

            // Keep dropdown fully visible: open to the side with more space.
            const openDown = spaceBelow >= 220 || spaceBelow >= spaceAbove;
            const maxHeight = Math.max(160, Math.min(desiredMaxHeight, openDown ? spaceBelow : spaceAbove));
            const top = openDown ? (r.bottom + gap) : Math.max(margin, r.top - gap - maxHeight);

            setRect({
                top,
                left: r.left,
                width: Math.max(r.width, 160),
                maxHeight,
            });
        };

        updatePosition();
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        return () => {
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    }, [isOpen, triggerRef]);

    useEffect(() => {
        if (!isOpen || !onClose) return;
        const handleOutside = (target: Node) => {
            if (triggerRef.current?.contains(target)) return;
            if (containerRef.current?.contains(target)) return;
            if (ignoreNextOutsideRef.current) {
                ignoreNextOutsideRef.current = false;
                return;
            }
            onClose();
        };
        const handleMouseDown = (e: MouseEvent) => handleOutside(e.target as Node);
        const handlePointerDown = (e: PointerEvent) => handleOutside(e.target as Node);
        const t = setTimeout(() => {
            ignoreNextOutsideRef.current = true;
            document.addEventListener("mousedown", handleMouseDown, true);
            document.addEventListener("pointerdown", handlePointerDown, true);
        }, 150);
        return () => {
            clearTimeout(t);
            document.removeEventListener("mousedown", handleMouseDown, true);
            document.removeEventListener("pointerdown", handlePointerDown, true);
        };
    }, [isOpen, onClose, triggerRef]);

    if (!isOpen || !rect || typeof document === "undefined") return null;
    return createPortal(
        <div
            ref={containerRef}
            className="filter-dropdown filter-dropdown-portal"
            style={{ top: rect.top, left: rect.left, minWidth: rect.width, maxHeight: rect.maxHeight }}
        >
            {children}
        </div>,
        document.body
    );
}

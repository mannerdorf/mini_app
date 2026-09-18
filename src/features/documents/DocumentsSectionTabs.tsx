import React, { useEffect, useId, useRef } from "react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import type { DocSectionKey } from "./documentsSectionConstants";
import "./DocumentsSectionTabs.css";

type DocumentsSectionTabsProps = {
    allowedDocSections: ReadonlyArray<{ key: DocSectionKey; label: string }>;
    docSection: DocSectionKey;
    onSelectSection: (key: DocSectionKey) => void;
};

export function DocumentsSectionTabs({
    allowedDocSections,
    docSection,
    onSelectSection,
}: DocumentsSectionTabsProps) {
    const groupId = useId();
    const rowRef = useRef<HTMLDivElement>(null);
    const activeRef = useRef<HTMLButtonElement>(null);
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        const row = rowRef.current;
        const active = activeRef.current;
        if (!row || !active) return;
        // Scroll only this strip; scrollIntoView can move the whole sticky page.
        const rowBounds = row.getBoundingClientRect();
        const activeBounds = active.getBoundingClientRect();
        const inset = 8;
        const delta = activeBounds.left < rowBounds.left + inset
            ? activeBounds.left - rowBounds.left - inset
            : activeBounds.right > rowBounds.right - inset
                ? activeBounds.right - rowBounds.right + inset
                : 0;
        if (delta) row.scrollBy({ left: delta, behavior: reducedMotion ? "auto" : "smooth" });
    }, [docSection, reducedMotion]);

    return (
        <LayoutGroup id={groupId}>
            <motion.div ref={rowRef} layoutScroll className="doc-sections-row doc-sections-row--smooth">
                <div className="doc-section-tabs-track" role="toolbar" aria-label="Раздел документов" aria-orientation="horizontal">
                    {allowedDocSections.map(({ key, label }) => {
                        const isActive = docSection === key;
                        return (
                            <button
                                key={key}
                                ref={isActive ? activeRef : undefined}
                                type="button"
                                className={isActive ? 'doc-section-tab doc-section-tab--active' : 'doc-section-tab'}
                                aria-pressed={isActive}
                                tabIndex={isActive ? 0 : -1}
                                onKeyDown={event => {
                                    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
                                    event.preventDefault();
                                    const buttons = Array.from(rowRef.current?.querySelectorAll<HTMLButtonElement>('button') || []);
                                    const index = buttons.indexOf(event.currentTarget);
                                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
                                        : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
                                    buttons[next]?.focus();
                                }}
                                onFocus={event => {
                                    const row = rowRef.current;
                                    if (!row) return;
                                    const bounds = row.getBoundingClientRect(), target = event.currentTarget.getBoundingClientRect();
                                    const delta = target.left < bounds.left + 8 ? target.left - bounds.left - 8 : target.right > bounds.right - 8 ? target.right - bounds.right + 8 : 0;
                                    if (delta) row.scrollBy({left:delta,behavior:reducedMotion?'auto':'smooth'});
                                }}
                                onClick={() => onSelectSection(key)}
                            >
                                {isActive && (
                                    <motion.span
                                        className="doc-section-tab-indicator"
                                        layoutId="active-document-section"
                                        initial={false}
                                        transition={{ duration: reducedMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
                                        aria-hidden="true"
                                    />
                                )}
                                <span className="doc-section-tab-label">{label}</span>
                            </button>
                        );
                    })}
                </div>
            </motion.div>
        </LayoutGroup>
    );
}

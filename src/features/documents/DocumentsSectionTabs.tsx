import { Flex } from "@maxhub/max-ui";
import type { DocSectionKey } from "./documentsSectionConstants";

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
    return (
        <div className="doc-sections-row">
            <Flex align="center" gap="0.5rem" style={{ flexWrap: 'nowrap', minWidth: 'min-content' }}>
                {allowedDocSections.map(({ key, label }) => {
                    const isActive = docSection === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            className={isActive ? 'doc-section-tab doc-section-tab--active' : 'doc-section-tab'}
                            onClick={() => onSelectSection(key)}
                        >
                            {label}
                        </button>
                    );
                })}
            </Flex>
        </div>
    );
}

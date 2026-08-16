import React from "react";
import { HAULZ_LEGAL } from "../../../lib/haulzLegal";

type DisclosureBlock = {
  title: string;
  rows: ReadonlyArray<{ label: string; value: string }>;
};

const DISCLOSURE_BLOCKS: DisclosureBlock[] = [
  HAULZ_LEGAL.disclosures.edo,
  HAULZ_LEGAL.disclosures.goslog,
];

function DisclosureTable({ block }: { block: DisclosureBlock }) {
  return (
    <div className="guest-legal-disclosure">
      <div className="guest-legal-disclosure__header">{block.title}</div>
      <dl className="guest-legal-disclosure__rows">
        {block.rows.map((row) => (
          <div key={row.label} className="guest-legal-disclosure__row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function GuestLegalDisclosures() {
  return (
    <section className="guest-legal-disclosures" aria-label="Реквизиты ЭДО и ГосЛог">
      {DISCLOSURE_BLOCKS.map((block) => (
        <DisclosureTable key={block.title} block={block} />
      ))}
    </section>
  );
}

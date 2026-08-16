import React from "react";
import { HAULZ_LEGAL } from "../../../lib/haulzLegal";

type DisclosureBlock = {
  title: string;
  rows: ReadonlyArray<{ label: string; value: string }>;
};

const DISCLOSURE_BLOCKS: DisclosureBlock[] = [
  {
    ...HAULZ_LEGAL.disclosures.edo,
    rows: HAULZ_LEGAL.disclosures.edo.rows.filter((row) => row.label !== "Наименование:"),
  },
  HAULZ_LEGAL.disclosures.goslog,
];

export function GuestLegalDisclosures() {
  return (
    <section className="guest-footer-disclosures" aria-label="Реквизиты ЭДО и ГосЛог">
      <div className="guest-footer-disclosures__grid">
        {DISCLOSURE_BLOCKS.map((block) => (
          <article key={block.title} className="guest-footer-disclosures__panel">
            <h2 className="guest-footer__heading">{block.title}</h2>
            <dl className="guest-footer-disclosures__list">
              {block.rows.map((row) => (
                <div key={row.label} className="guest-footer-disclosures__item">
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

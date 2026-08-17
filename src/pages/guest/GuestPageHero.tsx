import React from "react";

type Props = {
  title: string;
  lead: string;
  imageSrc: string;
  imageAlt: string;
};

/** Full-bleed subpage hero: brand + headline + lead. No pills / side media. */
export function GuestPageHero({ title, lead, imageSrc, imageAlt }: Props) {
  return (
    <section className="guest-subpage-hero" aria-label="HAULZ">
      <img
        src={imageSrc}
        alt={imageAlt}
        className="guest-subpage-hero__media"
        loading="eager"
      />
      <div className="guest-subpage-hero__veil" aria-hidden />
      <div className="guest-subpage-hero__content mx-auto max-w-guest px-4 sm:px-6 lg:px-8">
        <p className="guest-subpage-hero__brand">HAULZ</p>
        <h1 className="guest-subpage-hero__title">{title}</h1>
        <p className="guest-subpage-hero__lead">{lead}</p>
      </div>
    </section>
  );
}

import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "../../components/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/shadcn/card";
import { GUEST_STORYSET_ATTRIBUTION } from "../../constants/guestIllustrations";
import { HAULZ_WEBSITE_URL } from "../../constants/brand";
import { GUEST_FAQ_ITEMS } from "./guestFaqContent";

type Props = {
  onBack: () => void;
};

export function GuestFaqPage({ onBack }: Props) {
  return (
    <div className="guest-shell min-h-[100dvh]">
      <header className="sticky top-0 z-20 border-b border-[hsl(var(--guest-border))] bg-[hsl(var(--guest-background)/0.9)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-guest items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Button variant="outline" size="icon" aria-label="Назад" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold tracking-tight">Вопросы и ответы</h1>
        </div>
      </header>

      <main className="mx-auto max-w-guest px-4 py-6 sm:px-6 lg:px-8">
        <p className="mb-6 max-w-3xl text-sm leading-relaxed text-[hsl(var(--guest-muted-foreground))] sm:text-base">
          Ответы о перевозках HAULZ, входе в кабинет и поддержке. Подробнее — на{" "}
          <a href={HAULZ_WEBSITE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-haulz-brand underline-offset-2 hover:underline">
            haulz.pro
          </a>
          .
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {GUEST_FAQ_ITEMS.map((item) => (
            <Card key={item.q}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base leading-snug">{item.q}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm leading-relaxed text-[hsl(var(--guest-muted-foreground))]">{item.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-8 text-xs text-[hsl(var(--guest-muted-foreground))]">
          <a href={GUEST_STORYSET_ATTRIBUTION.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            {GUEST_STORYSET_ATTRIBUTION.label}
          </a>
        </p>
      </main>
    </div>
  );
}

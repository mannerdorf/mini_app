import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "../../components/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/shadcn/card";
import { GUEST_FAQ_ITEMS } from "./guestFaqContent";

type Props = {
  onBack: () => void;
};

export function GuestFaqPage({ onBack }: Props) {
  return (
    <div className="guest-shell min-h-[100dvh]">
      <header className="guest-header">
        <div className="mx-auto flex max-w-guest items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Button variant="outline" size="icon" aria-label="Назад" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="guest-section-heading">Вопросы и ответы</h1>
        </div>
      </header>

      <main className="mx-auto max-w-guest px-4 py-6 sm:px-6 lg:px-8">
        <p className="guest-section-lead mb-6 max-w-3xl sm:text-base">
          Ответы о перевозках HAULZ, входе в кабинет и поддержке.
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
      </main>
    </div>
  );
}

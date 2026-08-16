import React from "react";
import {
  Building2,
  Calculator,
  HelpCircle,
  Smartphone,
} from "lucide-react";
import { Button } from "../../components/shadcn/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/shadcn/sheet";
import {
  HAULZ_EMAIL,
  HAULZ_MAX_SUPPORT_BOT_URL,
} from "../../constants/brand";
import { isCapacitorAndroidApp } from "../../lib/androidAppUpdate";
import { GUEST_CONTACT_EMAIL_LABEL } from "./guestContactLabels";

type Props = {
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
  onAbout: () => void;
  onFaq: () => void;
  onApp: () => void;
  onCalculator: () => void;
};

type MenuItem = {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  onClick: () => void;
};

export function GuestHomeMenuSheet({ open, onClose, onLogin, onAbout, onFaq, onApp, onCalculator }: Props) {
  const isNativeAndroid = isCapacitorAndroidApp();

  const items: MenuItem[] = [
    {
      id: "login",
      label: "Войти в кабинет",
      hint: "Грузы, документы, калькулятор",
      icon: <Building2 className="h-5 w-5" />,
      onClick: () => {
        onClose();
        onLogin();
      },
    },
    {
      id: "calc",
      label: "Рассчитать перевозку",
      hint: "Ориентировочная стоимость",
      icon: <Calculator className="h-5 w-5" />,
      onClick: () => {
        onClose();
        onCalculator();
      },
    },
    {
      id: "about",
      label: "О компании",
      icon: <Building2 className="h-5 w-5" />,
      onClick: () => {
        onClose();
        onAbout();
      },
    },
    {
      id: "faq",
      label: "FAQ",
      hint: "Часто задаваемые вопросы",
      icon: <HelpCircle className="h-5 w-5" />,
      onClick: () => {
        onClose();
        onFaq();
      },
    },
  ];

  if (!isNativeAndroid) {
    items.push({
      id: "app",
      label: "Приложение",
      hint: "Android и iPhone",
      icon: <Smartphone className="h-5 w-5" />,
      onClick: () => {
        onClose();
        onApp();
      },
    });
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Меню</SheetTitle>
          <SheetDescription>Навигация и быстрые действия HAULZ</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-4">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[hsl(var(--guest-muted))]"
              onClick={item.onClick}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-haulz-brand-soft text-haulz-brand">
                {item.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{item.label}</span>
                {item.hint ? (
                  <span className="block truncate text-xs text-[hsl(var(--guest-muted-foreground))]">{item.hint}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
        <div className="border-t border-[hsl(var(--guest-border))] px-6 py-4 text-xs text-[hsl(var(--guest-muted-foreground))]">
          <div className="flex flex-wrap items-center gap-2">
            <a href={`mailto:${HAULZ_EMAIL}`} className="font-semibold text-haulz-brand">
              {GUEST_CONTACT_EMAIL_LABEL}
            </a>
            <span>·</span>
            <a href={HAULZ_MAX_SUPPORT_BOT_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-haulz-brand">
              MAX
            </a>
          </div>
          <Button variant="default" className="mt-4 w-full" onClick={() => { onClose(); onLogin(); }}>
            Войти
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

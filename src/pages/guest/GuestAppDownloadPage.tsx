import React from "react";
import { ArrowLeft, Smartphone } from "lucide-react";
import { Button } from "../../components/shadcn/button";
import { Badge } from "../../components/shadcn/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/shadcn/card";
import { ANDROID_RELEASE_ORIGIN } from "../../constants/androidRelease";
import { DEFAULT_APP_URL } from "../../../lib/haulzDomains";

type Props = {
  onBack: () => void;
};

const IOS_STEPS = [
  "Откройте сайт HAULZ в браузере Safari (не во встроенном браузере мессенджеров).",
  "Нажмите кнопку «Поделиться» — квадрат со стрелкой вверх внизу экрана.",
  "Выберите пункт «На экран «Домой»».",
  "Подтвердите добавление — иконка HAULZ появится на рабочем столе iPhone или iPad.",
] as const;

export function GuestAppDownloadPage({ onBack }: Props) {
  const appUrl = typeof window !== "undefined" ? window.location.origin : DEFAULT_APP_URL;

  return (
    <div className="guest-shell min-h-[100dvh]">
      <header className="guest-header">
        <div className="mx-auto flex max-w-guest items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Button variant="outline" size="icon" aria-label="Назад" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="guest-section-heading">Приложение HAULZ</h1>
        </div>
      </header>

      <main className="mx-auto max-w-guest space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        <p className="max-w-3xl text-sm leading-relaxed text-[hsl(var(--guest-muted-foreground))] sm:text-base">
          Установите HAULZ на телефон: Android — из нашего репозитория и RuStore, iPhone — через Safari на экран «Домой».
        </p>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Android</CardTitle>
                <CardDescription>APK из репозитория HAULZ и публикация в RuStore</CardDescription>
              </div>
              <Badge variant="secondary">Скоро будет доступно</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-[hsl(var(--guest-muted-foreground))]">
            <p>
              Скачивание APK с{" "}
              <span className="font-medium text-[hsl(var(--guest-foreground))]">{ANDROID_RELEASE_ORIGIN}</span>{" "}
              и установка из RuStore скоро появятся здесь.
            </p>
            <p>Следите за обновлениями — раздел откроется, как только сборки будут опубликованы.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-haulz-brand" />
              iPhone и iPad
            </CardTitle>
            <CardDescription>Добавление на экран «Домой» через Safari</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-[hsl(var(--guest-muted-foreground))]">
              Откройте{" "}
              <a href={appUrl} className="font-semibold text-haulz-brand underline-offset-2 hover:underline">
                {appUrl.replace(/^https?:\/\//, "")}
              </a>{" "}
              в Safari и выполните шаги:
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[hsl(var(--guest-foreground))]">
              {IOS_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

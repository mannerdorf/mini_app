import React, { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Calculator } from "lucide-react";
import { Button } from "../../components/shadcn/button";
import { GuestPageHero } from "./GuestPageHero";
import { GUEST_ILLUSTRATIONS } from "../../constants/guestIllustrations";

export type BlogListItem = {
  slug: string;
  title: string;
  meta_description: string | null;
  published_at: string | null;
  path: string;
};

type Props = {
  onBack: () => void;
  onOpenArticle: (slug: string) => void;
  onCalculator: () => void;
};

export function GuestBlogListPage({ onBack, onOpenArticle, onCalculator }: Props) {
  const [articles, setArticles] = useState<BlogListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/public-blog");
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Не удалось загрузить блог");
        if (!cancelled) setArticles(Array.isArray(data.articles) ? data.articles : []);
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message || "Ошибка загрузки");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="guest-shell min-h-[100dvh]">
      <div className="guest-page-back mx-auto flex max-w-guest items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Button variant="outline" size="icon" aria-label="Назад" onClick={onBack} className="bg-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm font-semibold text-[#374151]">Блог HAULZ</span>
      </div>

      <GuestPageHero
        title="Логистика Москва ↔ Калининград"
        lead="Статьи о перевозках, тарифах, таможне и B2B-логистике. Считайте доставку в калькуляторе — цены и сроки без сюрпризов."
        imageSrc={GUEST_ILLUSTRATIONS.aboutVisual}
        imageAlt="Блог HAULZ"
      />

      <main className="mx-auto max-w-guest px-4 pb-10 pt-2 sm:px-6 lg:px-8">
        {loading && <p className="text-sm text-[#6b7280]">Загрузка статей…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && articles.length === 0 && (
          <div className="rounded-2xl bg-white p-6 text-sm text-[#6b7280]">
            Пока нет опубликованных материалов. Скоро появятся статьи из медиаплана HAULZ.
          </div>
        )}

        <div className="grid gap-3">
          {articles.map((a) => (
            <button
              key={a.slug}
              type="button"
              onClick={() => onOpenArticle(a.slug)}
              className="rounded-2xl bg-white p-5 text-left shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
                  <BookOpen className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-[#111827]">{a.title}</h2>
                  {a.meta_description && (
                    <p className="mt-1 line-clamp-2 text-sm text-[#6b7280]">{a.meta_description}</p>
                  )}
                  <p className="mt-2 text-xs font-medium text-[#2563eb]">
                    Читать <ArrowRight className="ml-1 inline h-3 w-3" />
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-8 rounded-[1.75rem] bg-[#dbeafe] p-6 sm:p-8">
          <p className="text-lg font-bold text-[#111827]">Нужен расчёт перевозки?</p>
          <p className="mt-1 text-sm text-[#4b5563]">Калькулятор Москва ↔ Калининград — без регистрации.</p>
          <Button className="mt-4" onClick={onCalculator}>
            <Calculator className="mr-2 h-4 w-4" />
            Открыть калькулятор
          </Button>
        </div>
      </main>
    </div>
  );
}

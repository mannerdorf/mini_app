import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calculator } from "lucide-react";
import { Button } from "../../components/shadcn/button";
import { markdownToSafeHtml } from "../../lib/markdownToSafeHtml";

type Article = {
  slug: string;
  title: string;
  meta_description: string | null;
  body_markdown: string;
  published_at: string | null;
  telegram_teaser: string | null;
};

type Props = {
  slug: string;
  onBack: () => void;
  onCalculator: () => void;
};

export function GuestBlogArticlePage({ slug, onBack, onCalculator }: Props) {
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/public-blog?slug=${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Статья не найдена");
        if (!cancelled) setArticle(data.article as Article);
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message || "Ошибка");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const html = useMemo(() => markdownToSafeHtml(article?.body_markdown || ""), [article?.body_markdown]);

  return (
    <div className="guest-shell min-h-[100dvh] bg-[#f8fafc]">
      <div className="guest-page-back mx-auto max-w-guest px-4 sm:px-6 lg:px-8">
        <Button variant="outline" size="icon" aria-label="К блогу" onClick={onBack} className="bg-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm font-semibold text-[#374151]">Блог</span>
      </div>

      <main className="mx-auto max-w-guest px-4 pb-12 pt-4 sm:px-6 lg:px-8">
        {loading && <p className="text-sm text-[#6b7280]">Загрузка…</p>}
        {error && (
          <div className="rounded-2xl bg-white p-6">
            <p className="text-sm text-red-600">{error}</p>
            <Button className="mt-4" variant="outline" onClick={onBack}>
              К списку статей
            </Button>
          </div>
        )}
        {article && (
          <article className="rounded-[1.5rem] bg-white p-6 sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2563eb]">HAULZ · Блог</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#111827] sm:text-4xl">{article.title}</h1>
            {article.meta_description && (
              <p className="mt-3 text-base leading-relaxed text-[#4b5563]">{article.meta_description}</p>
            )}
            <div
              className="guest-blog-prose mt-8 space-y-3 text-[0.95rem] leading-relaxed text-[#374151] [&_a]:text-[#2563eb] [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[#111827] [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:ml-4 [&_ul]:list-disc [&_ul]:pl-2"
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <div className="mt-10 rounded-2xl bg-[#eff6ff] p-5">
              <p className="font-semibold text-[#111827]">Рассчитайте перевозку Москва ↔ Калининград</p>
              <p className="mt-1 text-sm text-[#4b5563]">Ориентир по цене и сроку — в калькуляторе HAULZ.</p>
              <Button className="mt-3" onClick={onCalculator}>
                <Calculator className="mr-2 h-4 w-4" />
                Калькулятор
              </Button>
            </div>
          </article>
        )}
      </main>
    </div>
  );
}

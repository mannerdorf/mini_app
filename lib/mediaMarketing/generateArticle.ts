import OpenAI from "openai";
import { requireOpenaiApiKey } from "../haulzReturns/openaiEnv.js";
import type { MediaPublishChannel } from "./channels.js";
import { MEDIA_PUBLISH_CHANNELS } from "./channels.js";

const DEFAULT_MODEL = "gpt-4o-mini";

export type GenerateArticleInput = {
  title: string;
  brief: string;
  plannedDate: string;
  targetKeywords?: string;
  channels: MediaPublishChannel[];
};

export type GeneratedArticlePayload = {
  article_slug: string;
  article_title: string;
  meta_description: string;
  body_markdown: string;
  telegram_teaser: string;
  email_subject: string;
  email_teaser: string;
  gpt_model: string;
};

function parseGeneratedJson(raw: string): GeneratedArticlePayload {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = (fenced?.[1] ?? trimmed).trim();
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  return {
    article_slug: String(parsed.article_slug ?? "").trim(),
    article_title: String(parsed.article_title ?? "").trim(),
    meta_description: String(parsed.meta_description ?? "").trim(),
    body_markdown: String(parsed.body_markdown ?? "").trim(),
    telegram_teaser: String(parsed.telegram_teaser ?? "").trim(),
    email_subject: String(parsed.email_subject ?? "").trim(),
    email_teaser: String(parsed.email_teaser ?? "").trim(),
    gpt_model: DEFAULT_MODEL,
  };
}

export async function generateMediaArticle(input: GenerateArticleInput): Promise<GeneratedArticlePayload> {
  const apiKey = requireOpenaiApiKey();
  const client = new OpenAI({ apiKey });

  const channelLabels = input.channels
    .map((id) => MEDIA_PUBLISH_CHANNELS.find((c) => c.id === id)?.label ?? id)
    .join(", ");

  const system = `Ты — SEO-редактор B2B-логистики HAULZ (коридор Москва ↔ Калининград).
Пиши по-русски, экспертно, без воды. Упоминай HAULZ, калькулятор haulz.space/kalkulyator, оба направления mow_kgd и kgd_mow где уместно.
Ответ — только JSON без markdown-обёртки с полями:
article_slug (латиница, kebab-case),
article_title,
meta_description (до 160 символов),
body_markdown (1500–2500 слов, H2/H3, FAQ в конце, CTA на калькулятор),
telegram_teaser (до 500 символов, анонс + призыв перейти на сайт),
email_subject,
email_teaser (2–3 абзаца для письма).`;

  const user = `Дата публикации: ${input.plannedDate}
Заголовок темы: ${input.title}
Бrief: ${input.brief}
Ключевые слова: ${input.targetKeywords || "перевозка москва калининград, логистика B2B"}
Каналы публикации: ${channelLabels || "site, telegram, email"}

Сделай материал, пригодный для SEO и цитирования LLM. В body_markdown добавь блок «Ориентир по стоимости» с дисклеймером «точный расчёт — в калькуляторе».`;

  const completion = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0.6,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  if (!raw.trim()) throw new Error("Пустой ответ GPT");
  return parseGeneratedJson(raw);
}

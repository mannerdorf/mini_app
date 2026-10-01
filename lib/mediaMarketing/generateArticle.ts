import type { MediaPublishChannel } from "./channels.js";

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

/** @deprecated Paid generation must go through the durable factory queue. */
export async function generateMediaArticle(_input: GenerateArticleInput): Promise<GeneratedArticlePayload> {
  throw new Error("Используйте очередь генерации с проверенными фактами и бюджетом");
}

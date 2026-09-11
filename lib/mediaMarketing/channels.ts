export type MediaPublishChannel =
  | "site"
  | "telegram"
  | "email"
  | "vk"
  | "dzen"
  | "vc_ru"
  | "youtube"
  | "habr"
  | "max_messenger"
  | "partner_newsletter"
  | "yandex_business"
  | "linkedin";

export type MediaChannelInfo = {
  id: MediaPublishChannel;
  label: string;
  hint: string;
};

export const MEDIA_PUBLISH_CHANNELS: MediaChannelInfo[] = [
  { id: "site", label: "Сайт / блог", hint: "Canonical на haulz.space/blog — основа SEO" },
  { id: "telegram", label: "Telegram", hint: "Анонс + ссылка на полную статью на сайте" },
  { id: "email", label: "Email", hint: "Рассылка клиентам / подписчикам" },
  { id: "vk", label: "VK", hint: "Пост в сообществе или личной странице" },
  { id: "dzen", label: "Дзен", hint: "Переопубликация с canonical на сайт" },
  { id: "vc_ru", label: "VC.ru", hint: "Экспертные материалы B2B" },
  { id: "youtube", label: "YouTube", hint: "Короткое видео или описание под ролик" },
  { id: "habr", label: "Habr", hint: "Технические/логистические кейсы" },
  { id: "max_messenger", label: "MAX", hint: "Канал или бот MAX" },
  { id: "partner_newsletter", label: "Партнёрская рассылка", hint: "Гостевой пост у партнёра" },
  { id: "yandex_business", label: "Яндекс.Бизнес", hint: "Посты и новости компании" },
  { id: "linkedin", label: "LinkedIn", hint: "B2B-аудитория, англ/ру" },
];

export type MediaAdPlacementType =
  | "blogger"
  | "banner"
  | "native"
  | "podcast"
  | "event"
  | "pr_article"
  | "seo_link"
  | "referral"
  | "rented_space"
  | "other";

export const MEDIA_AD_PLACEMENT_TYPES: Array<{ id: MediaAdPlacementType; label: string }> = [
  { id: "blogger", label: "Блогер / инфлюенсер" },
  { id: "banner", label: "Баннер / медийка" },
  { id: "native", label: "Нативная интеграция" },
  { id: "podcast", label: "Подкаст / эфир" },
  { id: "event", label: "Мероприятие / стенд" },
  { id: "pr_article", label: "PR-статья / пресс-релиз" },
  { id: "seo_link", label: "SEO-ссылка / каталог" },
  { id: "referral", label: "Реферал / партнёр" },
  { id: "rented_space", label: "Арендованное место" },
  { id: "other", label: "Другое" },
];

export const MEDIA_CONTENT_STATUSES = [
  { id: "planned", label: "Запланировано" },
  { id: "draft", label: "Черновик (GPT)" },
  { id: "ready", label: "Готово к публикации" },
  { id: "published", label: "Опубликовано" },
  { id: "cancelled", label: "Отменено" },
] as const;

export const MEDIA_AD_STATUSES = [
  { id: "planned", label: "Запланировано" },
  { id: "active", label: "Активно" },
  { id: "completed", label: "Завершено" },
  { id: "cancelled", label: "Отменено" },
] as const;

export function parseChannels(raw: unknown): MediaPublishChannel[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(MEDIA_PUBLISH_CHANNELS.map((c) => c.id));
  return raw.filter((c): c is MediaPublishChannel => typeof c === "string" && allowed.has(c as MediaPublishChannel));
}

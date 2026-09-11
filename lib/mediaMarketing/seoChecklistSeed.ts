import type { Pool } from "pg";

export type SeoChecklistSeedRow = {
  category: string;
  title: string;
  description: string;
  owner_action: string;
  doc_link?: string;
  sort_order: number;
};

export const SEO_CHECKLIST_SEED: SeoChecklistSeedRow[] = [
  {
    category: "tech",
    title: "Яндекс.Вебмастер + Google Search Console",
    description: "Подключить haulz.space, отправить sitemap.xml, следить за индексацией.",
    owner_action: "Зарегистрировать сайт в Вебмастере и GSC, загрузить sitemap https://haulz.space/sitemap.xml",
    doc_link: "https://webmaster.yandex.ru",
    sort_order: 10,
  },
  {
    category: "tech",
    title: "Проверить индексацию landing MOW↔KGD",
    description: "Страницы /perevozka-moskva-kaliningrad и /perevozka-kaliningrad-moskva должны быть в index.",
    owner_action: "После деплоя: site:haulz.space perevozka — или проверка URL Inspection в GSC",
    sort_order: 20,
  },
  {
    category: "tech",
    title: "Canonical haulz.space",
    description: "haulz.ru → 301 на haulz.space; один canonical для SEO.",
    owner_action: "Проверить в Timeweb/DNS редирект haulz.ru → https://haulz.space",
    sort_order: 30,
  },
  {
    category: "tech",
    title: "Public API и llms.txt",
    description: "LLM и агенты используют /api/public/v1 и llms.txt.",
    owner_action: "curl https://haulz.space/api/public/v1/routes и https://haulz.space/llms.txt",
    sort_order: 40,
  },
  {
    category: "content",
    title: "Редакционный календарь (2+ статьи/мес)",
    description: "Медиаплан в CMS: темы под MOW↔KGD, даты, каналы.",
    owner_action: "Заполнить медиаплан на квартал в разделе «Медиа» CMS",
    sort_order: 50,
  },
  {
    category: "content",
    title: "Статьи с CTA на калькулятор",
    description: "Каждая публикация — ссылка на /kalkulyator?direction=…",
    owner_action: "При генерации GPT указать канал «Сайт» и проверить CTA в тексте",
    sort_order: 60,
  },
  {
    category: "content",
    title: "Расширить FAQ до 15+ вопросов",
    description: "Long-tail запросы по перевозке, таможне, LTL.",
    owner_action: "Собрать вопросы от менеджеров → добавить в guestFaq или блог",
    sort_order: 70,
  },
  {
    category: "telegram",
    title: "Telegram: анонс → сайт",
    description: "Не дублировать полный текст в TG — только тизер + ссылка на haulz.space.",
    owner_action: "Настроить шаблон поста в медиаплане (поле telegram_teaser)",
    sort_order: 80,
  },
  {
    category: "offpage",
    title: "Яндекс.Бизнес / 2GIS",
    description: "Карточки HAULZ в Москве и Калининграде с адресами складов.",
    owner_action: "Создать/обновить карточки, указать haulz.space и телефоны складов",
    sort_order: 90,
  },
  {
    category: "offpage",
    title: "Партнёры и каталоги",
    description: "Взаимные упоминания, отраслевые каталоги логистики.",
    owner_action: "Список партнёров → фиксировать в «Реклама и интеграции»",
    sort_order: 100,
  },
  {
    category: "conversion",
    title: "UTM-метки для каналов",
    description: "utm_source для TG, email, VK и т.д.",
    owner_action: "Использовать ?utm_source=telegram&utm_medium=social&utm_campaign=<slug>",
    sort_order: 110,
  },
  {
    category: "llm",
    title: "MCP / GPT Actions",
    description: "Подключить haulz-quote MCP и Custom GPT с OpenAPI.",
    owner_action: "См. mcp/haulz-quote/README.md и openapi/public-quote.yaml",
    doc_link: "/openapi/public-quote.yaml",
    sort_order: 120,
  },
  {
    category: "llm",
    title: "Intent «расчёт стоимости» в Алисе",
    description: "Голосовой запрос «сколько стоит перевозка MOW–KGD».",
    owner_action: "Добавить intent в навык Алисы → /api/public/v1/estimate",
    sort_order: 130,
  },
];

export async function ensureMediaSeoChecklistSeeded(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ n: string }>(`select count(*)::text as n from media_seo_checklist`);
  if (Number(rows[0]?.n) > 0) return;
  for (const row of SEO_CHECKLIST_SEED) {
    await pool.query(
      `insert into media_seo_checklist (category, title, description, owner_action, doc_link, sort_order)
       values ($1, $2, $3, $4, $5, $6)`,
      [row.category, row.title, row.description, row.owner_action, row.doc_link ?? null, row.sort_order],
    );
  }
}

import type { ProgramChannel, ProgramTask } from "./programTypes.js";

const plan = "docs/seo-aeo-geo-content-factory-2026-09-30.md";
const audit = "docs/seo-geo-plan-2026-09-30.md";

type TaskDefinition = Omit<ProgramTask, "status" | "owner" | "notes" | "evidence" | "updated_at" | "updated_by">;
const definitions: TaskDefinition[] = [
  {
    id: "T00", title: "Панель управления программой", track: "foundation", priority: "P0", phase: 0, dependencies: [],
    description: "Единый рабочий журнал SEO, AEO, GEO и контент-завода: задачи, ответственные, доказательства, каналы и реальные показатели. Код панели подготовлен; выпуск и настройка хранилища требуют проверки.",
    acceptance: "Миграция применена; администратор сохраняет задачи и каналы; журнал показывает автора изменений; результат проверен в рабочем окружении.",
    files: ["docs/SEO_AEO_GEO.md", "src/features/admin/sections/AdminGrowthProgramPanel.tsx", "src/features/admin/sections/AdminMediaMarketingPanel.tsx", "api/admin-media-program.ts", "migrations/122_media_program.sql"], links: [],
  },
  {
    id: "T01", title: "Базовые метрики и инвентаризация услуг", track: "foundation", priority: "P0", phase: 1, dependencies: [],
    description: "Зафиксировать источники заявок, экономику перевозок и подтверждённые услуги. B2B — основной поток; начальный ориентир редакции 80% B2B / 20% частные перевозки с пересмотром по заявкам и марже. Частные услуги публиковать после подтверждения.",
    acceptance: "Определены владелец аналитики, источники заявок, подтверждённые услуги, бизнес-цели и исходный период измерения.",
    files: [plan], links: [{ label: "Яндекс Вебмастер", url: "https://webmaster.yandex.ru/" }, { label: "Google Search Console", url: "https://search.google.com/search-console" }],
  },
  {
    id: "T02", title: "Основной домен, canonical и редиректы", track: "seo", priority: "P0", phase: 1, dependencies: ["T01"],
    description: "Выбрать основной публичный домен по истории, ссылкам и аналитике. Проверить дубли .space, .pro и .ru, canonical и перенаправления; сохранить доступность API и кабинетов.",
    acceptance: "На контрольной выборке один канонический публичный URL; карта редиректов согласована; API и интеграции проходят проверки.",
    files: [audit, "docs/audits/seo-live-2026-09-30.json", "scripts/generate-route-seo-html.mjs"], links: [],
  },
  {
    id: "T03", title: "Готовый HTML, 404, ссылки и sitemap", track: "seo", priority: "P0", phase: 1, dependencies: ["T02"],
    description: "Отдавать основной текст и метаданные без выполнения JavaScript. Проверить матрицу маршрутов, обычные ссылки, soft-404, слеши и полноту sitemap, включая статьи после первых 100.",
    acceptance: "Приоритетные страницы читаются без JS, имеют свои метаданные и canonical; неизвестные URL возвращают 404; sitemap содержит доступные канонические страницы.",
    files: [audit, "scripts/generate-route-seo-html.mjs", "api/sitemap.ts", "src/pages/guest/GuestBlogArticlePage.tsx", "src/pages/guest/GuestBlogListPage.tsx"], links: [],
  },
  {
    id: "T04", title: "База фактов и правила публикации", track: "foundation", priority: "P0", phase: 1, dependencies: ["T01"],
    description: "Собрать проверенные тарифы, сроки, ограничения, условия услуг и доказательства. Назначить эксперта компании и правила удержания материалов при противоречии или устаревании фактов.",
    acceptance: "У каждого ключевого факта есть источник, владелец, дата проверки и срок актуальности; утверждены условия автоматической публикации и исключения.",
    files: [plan, "lib/haulzCalculator/publicEstimate.ts", "public/openapi/public-quote.yaml"], links: [],
  },
  {
    id: "T05", title: "Семантическое ядро и карта URL", track: "seo", priority: "P1", phase: 1, dependencies: ["T04"],
    description: "Собрать спрос по направлениям Москва ↔ Калининград, услугам и задачам. Сначала B2B, затем отдельные подтверждённые частные сценарии. Исходные 200–500 формулировок и 30–60 групп — ориентир исследования, не готовая частотность.",
    acceptance: "Каждая выбранная группа имеет источник спроса, регион, намерение, подтверждённую услугу и одну основную страницу; синонимичные частоты не суммируются.",
    files: [plan], links: [{ label: "Wordstat: работа со статистикой", url: "https://yandex.ru/support2/wordstat/ru/" }],
  },
  {
    id: "T06", title: "Типы контента и шаблоны SEO/AEO/GEO", track: "aeo", priority: "P1", phase: 2, dependencies: ["T05"],
    description: "Развести услуги, инструкции, кейсы и новости. Для каждой потребности — точный ответ, условия, доказательства, авторство и переход к расчёту или обращению; разметка соответствует видимому содержанию.",
    acceptance: "Услуга и статья доступны по нужным URL; шаблоны покрывают цель, ответ, доказательство и CTA; цены и сроки связаны с проверенными фактами.",
    files: [plan, "lib/mediaMarketing/generateArticle.ts", "src/pages/guest/GuestBlogArticlePage.tsx"], links: [{ label: "Google: блоки ответов", url: "https://developers.google.com/search/docs/appearance/featured-snippets" }],
  },
  {
    id: "T07", title: "Версии, редактор, предпросмотр и каналы CMS", track: "factory", priority: "P1", phase: 2, dependencies: ["T04"],
    description: "Расширить существующую CMS: разделить опубликованную и рабочую версии, статусы каналов, проверки на сервере, предпросмотр и восстановление версии.",
    acceptance: "Перегенерация не скрывает живую статью; TG-only не попадает в блог; редактор видит изменения перед публикацией; проверены откат и серверная валидация.",
    files: ["migrations/102_media_marketing.sql", "api/admin-media-plans.ts", "api/admin-media-plans-generate.ts", "lib/mediaMarketing/blogArticles.ts", "api/public-blog.ts"], links: [],
  },
  {
    id: "T08", title: "Очередь, источники, генерация и проверки", track: "factory", priority: "P1", phase: 2, dependencies: ["T04", "T06", "T07"],
    description: "Добавить устойчивые задания, сбор источников, пакет фактов, тематическое задание и проверку результата. Записывать попытки, стоимость, ошибки и причины удержания материала.",
    acceptance: "После перезапуска задания восстанавливаются; повтор не создаёт дубль; недоступный источник и конфликт фактов удерживают публикацию; непроверенные материалы не выходят автоматически.",
    files: [plan, "lib/mediaMarketing/generateArticle.ts", "api/admin-media-plans-generate.ts"], links: [],
  },
  {
    id: "T09", title: "Пилот: 8–10 материалов", track: "factory", priority: "P1", phase: 3, dependencies: ["T03", "T08"],
    description: "Проверить полный цикл на ограниченной партии, преимущественно для B2B. Сверить факты с экспертом и источниками; измерить стоимость принятого материала и число доработок.",
    acceptance: "8–10 материалов прошли редакционную и техническую проверку; факты сверены, страницы доступны, ошибки исправлены; известны затраты на принятый материал.",
    files: [plan, "api/admin-media-plans.ts", "api/public-blog.ts"], links: [],
  },
  {
    id: "T10", title: "Производство первой волны", track: "factory", priority: "P1", phase: 4, dependencies: ["T09"],
    description: "Выпустить или улучшить 15–25 приоритетных страниц по ядру, сохраняя проверку фактов и очередь обновлений. Масштабировать только после исправления ошибок пилота и индексации.",
    acceptance: "15–25 качественных новых или улучшенных страниц закрывают подтверждённые потребности; у каждой есть владелец актуальности, внутренние ссылки и измерение результата.",
    files: [plan, "api/admin-media-plans.ts"], links: [],
  },
  {
    id: "T11", title: "Мониторинг новостей и обновлений", track: "factory", priority: "P2", phase: 4, dependencies: ["T04", "T08"],
    description: "Составить реестр источников, отслеживать события и группировать дубли. У события фиксировать дату, затронутых отправителей, действие и источник; при изменении услуги обновлять постоянную страницу.",
    acceptance: "На тестовых событиях корректны даты, дубли и источники; ошибка источника записывается; факт отделён от оценки; расписание и лимиты согласованы и проверены.",
    files: [plan], links: [],
  },
  {
    id: "T12", title: "Издатель Telegram", track: "distribution", priority: "P2", phase: 4, dependencies: ["T07"],
    description: "Настроить редакционный канал и права бота, очередь, предпросмотр, отдельные статусы и message_id. Пост даёт самостоятельную пользу; исправления синхронизируются с материалом сайта.",
    acceptance: "Права канала подтверждены; отправка, редактирование, ошибки и неизвестный результат отправки проверены; нет слепых повторов; переходы и заявки учитываются отдельно.",
    files: [plan, "lib/mediaMarketing/generateArticle.ts"], links: [{ label: "Telegram Bot API", url: "https://core.telegram.org/bots/api" }],
  },
  {
    id: "T13", title: "Отчёты SEO/AEO/GEO и экономика", track: "geo", priority: "P2", phase: 3, dependencies: ["T01"],
    description: "Соединить данные поиска, фиксированную выборку 40–60 вопросов, рефералы и квалифицированные заявки. Раздельно считать индекс, ответы, упоминания, ссылки, переходы и бизнес-результат.",
    acceptance: "Определены источники и периоды; отчёт воспроизводим; неизвестные показатели отмечены как отсутствующие; цитирование не приравнивается к кликам или заявкам.",
    files: [plan], links: [{ label: "Алиса: отчёт Вебмастера", url: "https://yandex.ru/support/webmaster/ru/service/alice-answers" }, { label: "ChatGPT: издателям и разработчикам", url: "https://help.openai.com/en/articles/12627856-publishers-and-developers-faq" }],
  },
  {
    id: "T14", title: "Кейсы, исследование и внешние материалы", track: "geo", priority: "P2", phase: 5, dependencies: ["T04", "T09"],
    description: "Собирать реальные кейсы, фотографии упаковки, методику и разрешённые агрегаты собственных данных. Готовить экспертные материалы для партнёров и отраслевых медиа с проверяемыми источниками.",
    acceptance: "Есть опубликованные доказательства и проверяемые источники; для исследования указаны период, выборка и ограничения; внешняя кампания согласована отдельно.",
    files: [plan], links: [],
  },
  {
    id: "T15", title: "MCP и дополнительные каналы", track: "distribution", priority: "P3", phase: 6, dependencies: ["T13"],
    description: "Проверить практическое использование существующих MCP, публичного API и обработчика Алисы. YouTube, VK, email и другие форматы запускать как измеряемые эксперименты по аудитории и экономике.",
    acceptance: "Проверен реальный сценарий, настроены лимиты и наблюдение, измеряется результат; наличие кода, llms.txt или MCP не выдаётся за подтверждённое размещение и цитирование.",
    files: [plan, "mcp/haulz-quote/src/index.ts", "public/openapi/public-quote.yaml", "public/llms.txt", "api/alice.ts", "docs/alice-scenarios.md"], links: [{ label: "OpenAI: поисковые роботы", url: "https://developers.openai.com/api/docs/bots" }],
  },
];

/** Manifest metadata is versioned in code; only operational state is editable in the database. */
export function createProgramTasks(): ProgramTask[] {
  return definitions.map((task) => ({
    ...task, dependencies: [...task.dependencies], files: [...task.files], links: task.links.map((link) => ({ ...link })),
    status: task.id === "T00" ? "review" : "planned", owner: "", notes: "", evidence: "", updated_at: null, updated_by: null,
  }));
}

const channels = [
  { id: "site", name: "Сайт HAULZ", description: "Основной публичный источник и коммерческие страницы. Наличие сайта не подтверждает подключение аналитики или готовность индексации." },
  { id: "telegram", name: "Telegram", description: "Редакционный канал и бот-издатель. Адрес, права, отправка и статистика проверяются отдельно от уведомлений приложения." },
  { id: "youtube", name: "YouTube", description: "Видеоинструкции, упаковка и кейсы. URL и состояние канала указываются вручную после проверки владельцем." },
  { id: "vk", name: "VK", description: "Сообщество и распространение материалов. Эксперимент оценивается по аудитории, переходам и заявкам." },
  { id: "yandex_webmaster", name: "Яндекс Вебмастер", description: "Источник данных об индексации, поиске и ответах Алисы. Статус реестра не означает, что автоматическая загрузка отчётов уже настроена." },
  { id: "google_search_console", name: "Google Search Console", description: "Источник данных Google Search. Подтверждение сайта и доступы проверяются владельцем; показатели загружаются отдельной интеграцией." },
  { id: "bing", name: "Bing Webmaster Tools", description: "Индексация Bing и доступные AI-отчёты. Нужны подтверждённый ресурс, период и источник данных." },
  { id: "alice", name: "Алиса", description: "Реестр навыка и контрольной выборки ответов. В коде есть обработчик; публикация навыка и реальное использование пока не подтверждены." },
  { id: "chatgpt", name: "ChatGPT Search", description: "Наблюдение за ссылками и упоминаниями на фиксированной выборке. Это инструмент измерения, а не подключённый корпоративный канал или гарантия цитирования." },
  { id: "perplexity", name: "Perplexity", description: "Контрольная выборка ответов и источников с датой, режимом и вопросом. Показатели и статус проверки ведутся отдельно от рефералов." },
] as const;

export function createProgramChannels(): ProgramChannel[] {
  return channels.map((channel) => ({ ...channel, status: "not_connected", url: "", notes: "", updated_at: null, updated_by: null }));
}

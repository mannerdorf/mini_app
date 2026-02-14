# SMTP: переменные окружения в Vercel

Настройки почты берутся **только** из переменных окружения Vercel (БД не используется).

В **Vercel → Project → Settings → Environment Variables** добавьте:

| Переменная      | Описание              |
|-----------------|------------------------|
| `SMTP_HOST`     | SMTP хост (обязательно) |
| `SMTP_PORT`     | SMTP порт (по умолчанию 465) |
| `SMTP_USER`     | SMTP пользователь      |
| `SMTP_PASSWORD` | Пароль — **обязательно Secret** |
| `FROM_EMAIL`    | От кого (email)        |
| `FROM_NAME`     | От кого (имя), по умолчанию HAULZ |
| `EMAIL_TEMPLATE_REGISTRATION` | *(необяз.)* HTML-шаблон письма при регистрации |
| `EMAIL_TEMPLATE_PASSWORD_RESET` | *(необяз.)* HTML-шаблон при сбросе пароля |

- `SMTP_PASSWORD` отметьте как **Sensitive** (Secret).
- Подстановки в шаблонах: `[login]`, `[email]`, `[password]`, `[company_name]`.
- После добавления переменных сделайте **Redeploy** проекта.

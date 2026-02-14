# SMTP: переменные окружения в Vercel

Если в БД нет настроек почты, приложение подхватит их из переменных окружения Vercel.

В **Vercel → Project → Settings → Environment Variables** добавьте:

| Переменная      | Значение           | Описание              |
|-----------------|--------------------|------------------------|
| `SMTP_HOST`     | `smtp.yandex.ru`   | SMTP хост              |
| `SMTP_PORT`     | `465`              | SMTP порт              |
| `SMTP_USER`     | `info@haulz.pro`   | SMTP пользователь      |
| `SMTP_PASSWORD` | *(пароль приложения)* | Пароль — **обязательно Secret** |
| `FROM_EMAIL`    | `info@haulz.pro`   | От кого (email)        |
| `FROM_NAME`     | `HAULZ`            | От кого (имя)          |

- `SMTP_PASSWORD` задайте вручную и отметьте как **Sensitive** (Secret).
- Остальные можно задать как обычные переменные.
- После добавления переменных сделайте **Redeploy** проекта.

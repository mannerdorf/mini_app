# Переезд на haulz.space (основной) + haulz.ru (алиас)

## Целевая схема

```
Браузер (https://haulz.space или https://haulz.ru)
    → fetch /api/* на ТОМ ЖЕ хосте (same-origin)
    → nginx фронта проксирует /api/ → VPS (api.haulz.space)
    → Node haulz-api :3000 → Postgres

Webhooks / Partner API / Capacitor:
    → https://api.haulz.space напрямую
```

**Почему haulz.ru «вешал» VPS:** старый код слал браузер на `api.haulz.ru` (второй TLS, лишние соединения, проблемы на мобильных).  
**haulz.space + same-origin:** один HTTPS к фронту, API — через nginx proxy.

---

## 1. DNS haulz.space (Timeweb → Домены и SSL → haulz.space)

| Запись | Имя | Значение |
|--------|-----|----------|
| **A** | `@` | IP App Platform / Docker (фронт) |
| **A** | `www` | тот же IP |
| **A** | `api` | IP VPS `haulzbackend` |

---

## 2. haulz.ru как алиас (CNAME)

> **Важно:** для apex `@` (голый `haulz.ru`) стандартный **CNAME запрещён** DNS. Варианты:

### Вариант A — рекомендуется (canonical URL)

| Запись | Имя | Значение |
|--------|-----|----------|
| **CNAME** | `www` | `haulz.space` |
| **Переадресация 301** | `@` (`haulz.ru`) | `https://haulz.space` |

В Timeweb: **Домены** → `haulz.ru` → **Переадресация** → `https://haulz.space`, код **301**.

### Вариант B — оба имени открывают сайт

| Запись | Имя | Значение |
|--------|-----|----------|
| **CNAME** | `www` | `haulz.space` |
| **A** | `@` | **тот же IP**, что у `haulz.space` |

В App Platform добавить **оба** домена в SSL: `haulz.space`, `haulz.ru`, `www.haulz.ru`.

Код уже поддерживает same-origin API и для `haulz.ru`, и для `haulz.space`.

### api.haulz.ru

После cutover — **301** на `https://api.haulz.space` (для старых интеграторов) или отключить, если не нужен.

---

## 3. API-VPS

```bash
sudo cp /opt/haulz/app/deploy/nginx-api.haulz.space.conf /etc/nginx/sites-available/api.haulz.space
sudo ln -sf /etc/nginx/sites-available/api.haulz.space /etc/nginx/sites-enabled/
sudo certbot --nginx -d api.haulz.space
sudo nginx -t && sudo systemctl reload nginx
```

`/opt/haulz/.env`:

```env
PUBLIC_API_ORIGIN=https://api.haulz.space
APP_URL=https://haulz.space
NEXT_PUBLIC_APP_URL=https://haulz.space
```

```bash
cd /opt/haulz/app && sudo git pull && sudo npm ci && sudo systemctl restart haulz-api
curl -sS https://api.haulz.space/health
```

---

## 4. Фронт (App Platform / Docker)

**Не задавайте** `VITE_API_ORIGIN` для веб-сборки — браузер ходит в `/api/*` same-origin.

Dockerfile в репозитории собирает без `VITE_API_ORIGIN` по умолчанию.

Nginx (`deploy/nginx.miniapp-static.conf`) уже проксирует:

```nginx
location /api/ {
    proxy_pass http://YOUR_VPS_IP;
    proxy_set_header Host api.haulz.space;
}
```

Подставьте IP VPS в конфиге или вынесите в env при деплое.

**Capacitor / нативное приложение** — отдельная сборка:

```bash
VITE_API_ORIGIN=https://api.haulz.space npm run build
```

---

## 5. Webhooks

| Сервис | URL |
|--------|-----|
| Telegram | `https://api.haulz.space/api/tg-webhook` |
| MAX | `https://api.haulz.space/api/max-webhook` |
| Алиса | `https://api.haulz.space/api/alice` |

---

## 6. Порядок cutover

1. DNS `api.haulz.space` + nginx + SSL на VPS  
2. Обновить `/opt/haulz/.env`, `git pull`, restart  
3. App Platform: домен **haulz.space**, redeploy из `main` (**без** `VITE_API_ORIGIN`)  
4. Проверка login на `https://haulz.space` (Network: POST → `haulz.space/api/...`, не `api.haulz.space`)  
5. Webhooks на `api.haulz.space`  
6. `haulz.ru` → CNAME/301 (вариант A или B)  
7. Отключить лишнее на `api.haulz.ru` / старый App Platform только для `.ru`, если дублирует VPS  

---

## 7. Чеклист

- [ ] `curl https://api.haulz.space/health`
- [ ] Login на `https://haulz.space`
- [ ] DevTools: `/api/perevozki` → host `haulz.space`
- [ ] Мобильный (Safari / Telegram) — данные грузятся
- [ ] `haulz.ru` открывается или редиректит на `.space`
- [ ] Webhooks живые

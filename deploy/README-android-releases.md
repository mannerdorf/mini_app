# Android releases: app.haulz.space

Постоянный канал обновлений HAULZ Mini App на **Timeweb VPS** `200.165.236.49`.

| URL | Назначение |
|-----|------------|
| `https://app.haulz.space/` | Страница скачивания |
| `https://app.haulz.space/latest.apk` | Всегда последняя сборка |
| `https://app.haulz.space/version.json` | Манифест для приложения |
| `https://app.haulz.space/releases/haulz-miniapp-X.Y.Z.apk` | Архив версий |

Приложение в Capacitor при старте сравнивает `versionCode` с `version.json` и показывает баннер «Скачать обновление».

---

## Git-ветки

| Ветка | Назначение |
|-------|------------|
| `main` | **тест** — эксперименты и проверки |
| `staging` | **основной** код сайта (прод `haulz.space`) |
| **`cursor/android-app-ea4b`** | **сборка и деплой APK** на `app.haulz.space` |

На Mac перед сборкой APK:

```bash
git fetch origin
git checkout cursor/android-app-ea4b
git pull origin cursor/android-app-ea4b
# подтянуть актуальный прод-код с staging:
git merge origin/staging
```

Правки только под APK — коммит в `cursor/android-app-ea4b`, push, `npm run android:release`, деплoy на `app.haulz.space`.

Общие фичи для сайта и приложения сначала попадают в **`staging`**, затем мержатся в **`cursor/android-app-ea4b`** перед релизом APK.

---

## 1. DNS (Timeweb → haulz.space)

| Тип | Имя | Значение |
|-----|-----|----------|
| **A** | `app` | IP сервера APK (`200.165.236.49`) |

Пример: `android.haulz.space` → `185.x.x.x` (новый VPS, не обязательно `72.56.36.185` API).

---

## 2. Подготовка сервера (Ubuntu на Timeweb)

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx

sudo mkdir -p /var/www/app.haulz.space/releases
sudo chown -R www-data:www-data /var/www/app.haulz.space

sudo cp deploy/nginx-app.haulz.space.conf /etc/nginx/sites-available/app.haulz.space
sudo ln -sf /etc/nginx/sites-available/app.haulz.space /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/android.haulz.space
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d app.haulz.space
```

Проверка до первого APK:

```bash
curl -sS https://app.haulz.space/
curl -sI https://app.haulz.space/version.json | grep -i access-control
```

Если в APK раздел «Версия» не читает `version.json`, обновите nginx-конфиг на сервере APK (нужен `Access-Control-Allow-Origin` для Capacitor) и перезагрузите nginx:

```bash
sudo cp deploy/nginx-app.haulz.space.conf /etc/nginx/sites-available/app.haulz.space
sudo nginx -t && sudo systemctl reload nginx
```

---

## 3. Сборка APK (локально или CI)

Требования: JDK 21, Android SDK, **один keystore** для всех релизов (`android/haulz-release.jks`).

```bash
npm install

export JAVA_HOME="/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"   # Intel Mac
export PATH="$JAVA_HOME/bin:$PATH"
export ANDROID_HOME="$HOME/Library/Android/sdk"

npm run android:release
```

Перед каждым релизом **увеличьте** в `android/app/build.gradle`:

```gradle
versionCode 2        // было 1 → стало 2 (обязательно +1)
versionName "1.0.1"
```

API в APK: `https://haulz.space` (не `api.haulz.space`, пока там битый SSL).

---

## 4. Публикация на сервер

### Вариант A — scp с Mac/CI

```bash
export ANDROID_RELEASE_SSH=root@200.165.236.49
export ANDROID_RELEASE_HOST=app.haulz.space
export ANDROID_RELEASE_NOTES="Исправлен вход, баннер обновлений"

npm run android:deploy
# или:
./scripts/deploy-android-release.sh dist/haulz-miniapp-release.apk
```

Скрипт загружает:

- `latest.apk`
- `releases/haulz-miniapp-{versionName}.apk`
- `version.json`
- `index.html`

### Вариант B — локальный bundle (ручная загрузка)

```bash
./scripts/deploy-android-release.sh dist/haulz-miniapp-release.apk --local
# → dist/android-release/
# скопируйте содержимое на сервер в /var/www/android.haulz.space/
```

### Проверка

```bash
curl -sS https://app.haulz.space/version.json | python3 -m json.tool
curl -I https://android.haulz.space/latest.apk
```

---

## 5. Обновление на телефоне

1. Пользователь открывает приложение → баннер «Доступна версия X» → **Скачать**.
2. Или вручную: `https://android.haulz.space/latest.apk`.
3. Установка поверх старой версии работает только с **тем же keystore** и большим `versionCode`.

---

## 6. Переменные окружения

См. `deploy/env.android-release.example`:

| Переменная | Пример |
|------------|--------|
| `ANDROID_RELEASE_SSH` | `root@185.x.x.x` |
| `ANDROID_RELEASE_HOST` | `app.haulz.space` |
| `ANDROID_RELEASE_DIR` | `/var/www/app.haulz.space` |
| `ANDROID_RELEASE_NOTES` | текст для баннера |

---

## 7. Безопасность

- **Бэкап keystore** (`haulz-release.jks` + пароли) — без него нельзя выпускать обновления.
- Сервер APK — только статика (nginx), без Node/Postgres.
- Опционально: ограничить доступ к `/releases/` по IP или Basic Auth в nginx, если нужен закрытый канал.

---

## 8. Чеклист релиза

- [ ] `versionCode` увеличен
- [ ] `npm run android:release` успешен
- [ ] `npm run android:deploy` (или ручная загрузка)
- [ ] `curl version.json` — новый `versionCode`
- [ ] Установка на тестовый телефон
- [ ] Login через `haulz.space/api`

См. также: [ANDROID_APK.md](../docs/ANDROID_APK.md)

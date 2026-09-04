---
name: haulz-android-rebuild
description: >-
  HAULZ Android APK rebuild on Mac in 3 steps (sync version → build → publish
  to app.haulz.space). Use when the user asks for «правило пересборки android»,
  «пересборка apk», «дай команды для android», or Mac release after main is
  updated. Follow exactly — do not invent other deploy paths.
---

# HAULZ Android — пересборка APK (Mac, 3 этапа)

Постоянный канал: **https://app.haulz.space** (VPS `200.165.236.49`).

Перед Mac-сборкой `versionCode` / `versionName` должны быть **закоммичены в `main`**
(обычно bump делает агент или `./scripts/bump-android-version.sh`).

Скрипт `npm run android:release` сам выполняет `npm ci` — отдельно ставить
зависимости не нужно (если только не отладка).

---

## Этап 1 — синхронизация и версия

```bash
cd ~/mini_app
git checkout -- android/app/build.gradle
git pull origin main --ff-only
grep -E "versionCode|versionName" android/app/build.gradle
```

Сверка с продом (локальный `versionCode` **должен быть больше** remote):

```bash
curl -sS https://app.haulz.space/version.json
```

Если в `main` версия ещё не поднята — на Mac или в репо:

```bash
./scripts/bump-android-version.sh
# commit + push main, затем снова git pull
```

---

## Этап 2 — пересборка

```bash
export ANDROID_HOME="/Volumes/Cursor/haulz-build/android-sdk"
export GRADLE_USER_HOME="/Volumes/Cursor/haulz-build/gradle-home"
export TMPDIR="/Volumes/Cursor/haulz-build/tmp"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
export JAVA_HOME="/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

npm run android:release

export ANDROID_RELEASE_NOTES='кратко: что в релизе'
./scripts/deploy-android-release.sh dist/haulz-miniapp-release.apk --local

cat dist/android-release/version.json
```

`ANDROID_RELEASE_NOTES` — **менять каждый релиз** под фактические изменения.

Если Vite ругается на `@capacitor/*` — один раз:

```bash
npm ci && npm run android:release
```

---

## Этап 3 — публикация на app.haulz.space

Подставь актуальную версию из `build.gradle` или `dist/android-release/version.json`:

```bash
VERSION="$(grep versionName android/app/build.gradle | head -1 | sed 's/.*"\(.*\)".*/\1/')"

ssh root@200.165.236.49 'mkdir -p /var/www/app.haulz.space/releases'

scp ~/mini_app/dist/android-release/latest.apk \
    ~/mini_app/dist/android-release/version.json \
    ~/mini_app/dist/android-release/index.html \
    root@200.165.236.49:/var/www/app.haulz.space/

scp ~/mini_app/dist/android-release/releases/haulz-miniapp-${VERSION}.apk \
    root@200.165.236.49:/var/www/app.haulz.space/releases/

curl -sS https://app.haulz.space/version.json
```

Проверка: в JSON те же `versionCode` и `versionName`, что в `build.gradle`.

---

## Альтернатива этапу 3 (одной командой)

После успешного `npm run android:release`:

```bash
export ANDROID_RELEASE_NOTES='кратко: что в релизе'
./scripts/deploy-android-vps.sh
curl -sS https://app.haulz.space/version.json
```

---

## Файлы

| Что | Где |
|-----|-----|
| Версия | `android/app/build.gradle` |
| Bump | `scripts/bump-android-version.sh` |
| Сборка | `scripts/build-android-release-apk.sh` |
| Артефакты | `dist/haulz-miniapp-release.apk`, `dist/android-release/` |
| Подробнее | `docs/ANDROID_REBUILD.md` |

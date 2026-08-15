# Сборка подписанного Android APK (Capacitor)

Приложение: **HAULZ Mini App** (`ru.haulz.miniapp`).  
API в нативной сборке: **`https://haulz.space`**.  
Обновления: **`https://android.haulz.space`** — см. [deploy/README-android-releases.md](../deploy/README-android-releases.md).

## Требования

- Node.js ≥ 18
- JDK **21**
- Android SDK (Android Studio или [command-line tools](https://developer.android.com/studio#command-line-tools-only))
- Переменная **`ANDROID_HOME`** (или `ANDROID_SDK_ROOT`)

Пример:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
```

Установите SDK Platform **36** и Build-Tools (через Android Studio SDK Manager или `sdkmanager`).

## Быстрая сборка

```bash
npm install
npm run android:release
npm run android:deploy   # после настройки ANDROID_RELEASE_SSH
```

Скрипт:

1. при первом запуске создаёт `android/haulz-release.jks` и `android/keystore.properties` (локально, в git не попадают);
2. собирает web с `VITE_API_ORIGIN=https://api.haulz.space`;
3. выполняет `cap sync android`;
4. собирает **`assembleRelease`**.

Готовый APK:

- `dist/haulz-miniapp-release.apk`
- `android/app/build/outputs/apk/release/app-release.apk`

## Свой keystore (production)

1. Скопируйте `android/keystore.properties.example` → `android/keystore.properties`.
2. Положите JKS в `android/` и укажите пароли в `keystore.properties`.
3. Либо задайте пароли через env перед сборкой:

```bash
export HAULZ_ANDROID_STORE_PASSWORD='...'
export HAULZ_ANDROID_KEY_PASSWORD='...'
npm run android:release
```

**Не коммитьте** `*.jks`, `keystore.properties`.

## Отдельные шаги

```bash
npm run build:android    # только Vite → dist
npm run android:sync     # build + cap sync
cd android && ./gradlew assembleRelease
```

## Иконки

```bash
./scripts/generate-haulz-brand-icons.sh
npm run android:sync
```

## Проверка на устройстве

```bash
adb install -r dist/haulz-miniapp-release.apk
```

Убедитесь, что login и `/api/*` отвечают с телефона (не только Wi‑Fi).

# Сборка подписанного Android APK (Capacitor)

Приложение: **HAULZ Mini App** (`ru.haulz.miniapp`).  
API в нативной сборке: **`https://haulz.space`** (same-origin `/api/*` через nginx → VPS).  
Не используйте `https://api.haulz.space` в APK, пока на поддомене нет валидного SSL — Android блокирует login.  
Обновления: **`https://app.haulz.space`** — см. [deploy/README-android-releases.md](../deploy/README-android-releases.md).

## Требования

- Node.js ≥ 18
- JDK **17+** (рекомендуется **21**: `brew install openjdk@21`)
- Android SDK (Android Studio или [command-line tools](https://developer.android.com/studio#command-line-tools-only))
- Переменная **`ANDROID_HOME`** (или `ANDROID_SDK_ROOT`)

### macOS: JAVA_HOME

Путь Homebrew зависит от процессора (`uname -m`):

| Архитектура | JAVA_HOME |
|-------------|-----------|
| **Apple Silicon** (`arm64`) | `/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` |
| **Intel** (`x86_64`) | `/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home` |

```bash
brew install openjdk@21
export JAVA_HOME="/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"   # Intel
# export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"  # Apple Silicon
export PATH="$JAVA_HOME/bin:$PATH"
java -version   # должно быть 21.x, не 11
```

Скрипт `npm run android:release` пробует эти пути сам, если `java` в PATH ещё 11.

### Android SDK

На Mac SDK обычно:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
```

Установите SDK Platform **36** и Build-Tools (через Android Studio SDK Manager или `sdkmanager`).

### Мало места на внутреннем SSD

Gradle/SDK можно вынести на внешний диск (APFS):

```bash
DISK="/Volumes/YourDisk"
export ANDROID_HOME="$DISK/haulz-build/android-sdk"
export GRADLE_USER_HOME="$DISK/haulz-build/gradle-home"
export TMPDIR="$DISK/haulz-build/tmp"
```

В `android/gradle/wrapper/gradle-wrapper.properties` лучше `gradle-8.14.3-bin.zip` вместо `-all.zip` (меньше скачивает).

## Быстрая сборка

```bash
npm install
npm run android:release
npm run android:deploy   # после настройки ANDROID_RELEASE_SSH
```

Скрипт:

1. при первом запуске создаёт `android/haulz-release.jks` и `android/keystore.properties` (локально, в git не попадают);
2. собирает web с `VITE_API_ORIGIN=https://haulz.space`;
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

**Сканер посылки** (Профиль → Сканер посылки) запрашивает доступ к камере при первом нажатии «Сканировать». В `AndroidManifest.xml` должно быть разрешение `CAMERA` — после обновления APK система покажет диалог; если ранее отказали, включите камеру в настройках приложения HAULZ.

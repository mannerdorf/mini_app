# Сборка HAULZ iOS (Capacitor)

Приложение: **HAULZ** (`ru.haulz.miniapp`).  
API в нативной сборке: **`https://haulz.space`** (как у Android APK).  
Нужен **Mac + Xcode** — Linux/Cloud не собирает `.app` / IPA.

Версия в Xcode: **1.3.27** (`MARKETING_VERSION`), build **7** (`CURRENT_PROJECT_VERSION`). Метка JS: **`push-js 7`**.

Ветка: **`main`** (iOS влит в main). Быстрая шпаргалка: [IOS_REBUILD.md](./IOS_REBUILD.md).

## Требования (Intel Mac)

- Xcode **26.3** Universal в `/Applications/Xcode.app`  
  (`xcode-select -p` → `/Applications/Xcode.app/Contents/Developer`)
- Node.js ≥ 18
- CocoaPods (один раз). Ставьте **одной командой**, не вставляйте блок целиком — `brew` иначе съест следующие строки вместо `y`:

```bash
NONINTERACTIVE=1 brew install cocoapods
pod --version
```

## Сборка и запуск

```bash
cd ~/mini_app
git fetch origin
git pull origin main --ff-only
npm ci
```

Если `pod` ещё нет — **отдельной** командой:

```bash
NONINTERACTIVE=1 brew install cocoapods
pod --version
```

Затем:

```bash
npm run ios:sync
npx cap open ios
```

Открывайте **`ios/App/App.xcworkspace`**, не `.xcodeproj`. В Xcode:

1. Destination — **iPhone Simulator**, не My Mac.
2. **Signing & Capabilities** → Team (для устройства нужен Apple ID).
3. **Product → Run** (⌘R).

### Intel Mac: crash в `libobjc readClass`

Xcode 26 по умолчанию качает **Apple Silicon** runtime. На Intel это даёт `EXC_BAD_ACCESS` в `libobjc.A.dylib` `readClass` сразу при старте. Одна команда, потом ждать (несколько ГБ):

```bash
xcodebuild -downloadPlatform iOS -architectureVariant universal
```

Проверка:

```bash
xcrun simctl list runtimes
```

Если команда отвечает `No needed downloadables found for universal` — это **не ошибка**: runtime уже установлен (в Xcode 26.3 Universal он входит в `.xip`). Дальше не качайте платформу, а подтяните статическую линковку и пересоберите:

```bash
cd ~/mini_app
git pull origin cursor/ios-capacitor-fd2d
```

```bash
cd ios/App && pod install && cd ../..
```

```bash
npx cap open ios
```

В Xcode: destination **iPhone Simulator** (не My Mac), Product → Clean Build Folder, Run. Открыт должен быть `App.xcworkspace`.

Проверка runtime (не должно быть `unavailable`):

```bash
xcrun simctl list runtimes
```

Физический iPhone обходит симулятор полностью.

Или из терминала (симулятор, без подписи):

```bash
npm run ios:release
```

## Скрипты

| Команда | Что делает |
|---------|------------|
| `npm run build:ios` | Vite с `VITE_API_ORIGIN=https://haulz.space` |
| `npm run ios:sync` | web + `npx cap sync ios` (в т.ч. `pod install` на Mac) |
| `npm run ios:open` | открыть `ios/App/App.xcworkspace` |
| `npm run ios:release` | sync + `xcodebuild` для iOS Simulator |

## Камера

В `Info.plist` есть `NSCameraUsageDescription` и доступ к Фото — сканер посылки и претензии. При первом сканировании iOS покажет системный диалог.

## После симулятора

Симулятор только показывает, что Xcode и Capacitor собираются. Дальше по порядку:

1. **Проверить логин в симуляторе** — тот же аккаунт, что на сайте. API: `https://haulz.space`. Сканер посылки и камера претензий в симуляторе почти бесполезны (нет настоящей камеры).
2. **Запустить на физическом iPhone.** Симулятор подпись не проверяет, телефон — да. В скрине открыты Build Settings **проекта**, текст ошибки скрыт.

   Ошибка **Signing for "App" requires a development team** — единственная, из‑за которой сборка на iPhone падает. Предупреждения Capacitor (`UTType…`, `WKProcessPool`, `[CP] Copy Pods Resources`) из `node_modules` можно игнорировать.

   - Слева в колонке: **TARGETS → App** (не синий проект App).
   - Вкладка **Signing & Capabilities**.
   - **Automatically manage signing** включено.
   - **Team** → ваш Apple ID. Если пусто: Xcode → Settings → Accounts → **+** → Apple ID, затем снова Team.
   - На iPhone: Настройки → Конфиденциальность и безопасность → **Режим разработчика** → вкл. → перезагрузка.
   - Destination: **iPhone (Aleksandr)** → Run.

   Team в репозиторий не кладём: это ваш Apple ID на этой машине.
3. **TestFlight** — см. раздел ниже. Бесплатный Personal Team для TestFlight **не подходит**.

Не публикуйте IPA на `app.haulz.space` — это канал только для Android APK.

## TestFlight

Нужна платная программа [Apple Developer Program](https://developer.apple.com/programs/) (~99 USD/год). Personal Team (бесплатный Apple ID) ставит приложение только на ваш iPhone на 7 дней и **не умеет** заливать в TestFlight.

### 1. Аккаунт

1. Зарегистрируйтесь на [developer.apple.com/programs](https://developer.apple.com/programs/) на тот же Apple ID, что в Xcode → Settings → Accounts.
2. Дождитесь одобрения (часто сразу, иногда до 48 часов).
3. В Xcode → Signing & Capabilities → **Team** выберите **платную** команду (не Personal Team).

### 2. Приложение в App Store Connect

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → Apps → **+** → New App.
2. Platform: **iOS**.
3. Name: **HAULZ**.
4. Bundle ID: **`ru.haulz.miniapp`** (если нет в списке: Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs → зарегистрируйте `ru.haulz.miniapp`).
5. SKU: `haulz-miniapp` (внутренний код, пользователи не видят).
6. User Access: Full Access.

### 3. Archive и загрузка

В Xcode:

1. `git pull` ветки `cursor/ios-capacitor-fd2d`, затем `npm run ios:sync`.
2. Destination сверху: **Any iOS Device (arm64)** (не симулятор).
3. **Product → Archive**. Дождитесь Organizer.
4. **Distribute App** → **App Store Connect** → **Upload** → Next, пока не уйдёт билд.
5. Шифрование: в Info.plist уже `ITSAppUsesNonExemptEncryption = false` — в форме можно ответить, что не используете нестандартное шифрование.

Каждая новая заливка: увеличьте **Current Project Version** (`CURRENT_PROJECT_VERSION` в Xcode, сейчас **2**). Version (`1.3.24`) можно оставить, build должен расти: 2, 3, 4…

### 4. Тестеры

В App Store Connect → приложение HAULZ → **TestFlight**:

- Обработка билда: 10–40 минут (email «Finished processing»).
- **Internal Testing**: добавьте людей с ролью в App Store Connect (до 100). Ставят через приложение TestFlight, без ревью Apple.
- **External Testing**: ссылка для любых Apple ID (до 10 000). Нужно короткое «What to Test» и **Beta App Review** (обычно сутки).

На iPhone тестера: App Store → приложение **TestFlight** → Redeem / приглашение.

### Чего не делать

- Не нажимайте **Update to recommended settings** перед архивом.
- Не выкладывайте IPA на `app.haulz.space`.

## Push-уведомления (iOS + FCM)

Сервер уже шлёт пуши через Firebase Admin в те же токены, что Android. На iOS Capacitor без Firebase отдаёт **APNs-токен**, а API ждёт **FCM-токен** — поэтому нужен iOS-приложение в том же Firebase-проекте и `GoogleService-Info.plist` на Mac.

**Broadcast Push Notifications** в форме App ID **не включайте**. Нужен только обычный **Push Notifications**.

### 1. App ID (Apple Developer)

1. [developer.apple.com](https://developer.apple.com) → Identifiers → `ru.haulz.miniapp`.
2. Включите **Push Notifications**. Сохраните.
3. **Broadcast** оставьте выкл.

Если App ID уже с Push — ничего пересоздавать не нужно. Provisioning Xcode подтянет сам (Automatically manage signing).

### 2. Ключ APNs (.p8)

1. Apple Developer → Keys → **+**.
2. Имя: `HAULZ APNs`. Галка **Apple Push Notifications service (APNs)**.
3. Continue → Register → **Download** `.p8` (скачивается один раз).
4. Запомните **Key ID**. Team ID платной команды: в Membership (у вас уже есть команда для TestFlight).

`.p8` в git не кладём.

### 3. Firebase: iOS-приложение

Тот же проект Firebase, что для Android APK (`ru.haulz.miniapp`):

1. [Firebase Console](https://console.firebase.google.com) → Project settings → **Add app** → **iOS**.
2. Bundle ID: **`ru.haulz.miniapp`**.
3. Скачайте **`GoogleService-Info.plist`**.
4. Файл положите в `ios/App/App/GoogleService-Info.plist` (в `.gitignore`). Проверка: `ls ios/App/App/GoogleService-Info.plist`.
5. В Xcode файл уже в target **App** (копируется скриптом при Archive). **Add Files не нужен** — без файла на диске архив падает с ошибкой про plist.
6. Project settings → **Cloud Messaging** → iOS app → **APNs Authentication Key** → Upload `.p8`, Key ID, Team ID.

Сервисный аккаунт на API (`FIREBASE_SERVICE_ACCOUNT_JSON`) тот же, что для Android. Новый на VPS не нужен.

### 4. Сборка на Mac

```bash
cd ~/mini_app
git fetch origin
git checkout -B cursor/ios-capacitor-fd2d origin/cursor/ios-capacitor-fd2d
npm install
npm run ios:sync
cd ios/App && pod install && cd ../..
npx cap open ios
```

В Xcode у TARGETS **App** → Signing & Capabilities:

- Team — платная команда.
- Capability **Push Notifications** (из `App.entitlements` / `AppRelease.entitlements`).
- **Background Modes → Remote notifications** (уже в `Info.plist`).

Симулятор пуши почти не принимает. Проверка — **физический iPhone** или TestFlight.

Залейте **новый** архив: build **7**. На экране «Уведомления» должна быть строка `push-js 7`. Без неё это старый TestFlight — iPhone в админку не попадёт.

### 5. В приложении

1. Войдите в аккаунт.
2. Разрешите уведомления в системном диалоге iOS.
3. **Профиль → Уведомления → Включить push-уведомления** (если диалог уже был — статус «включены»).
4. Включите нужные события.

Токен уходит как `POST /api/fcm-subscribe` с `platform: "ios"`.

### Если пуш не приходит

- Нет `ios/App/App/GoogleService-Info.plist` на диске → Archive падает. Старый TestFlight без плиста в IPA не шлёт FCM, в админке только android.
- Нет ключа APNs в Firebase → токен может сохраниться, отправка с сервера не дойдёт до телефона.
- Старый билд TestFlight без FCM / без фикса multi-device — нужен архив с этим кодом (build 5+).
- Включение push на iPhone обнуляло админку «Кто включил push» и снимало Android: `POST /api/fcm-unsubscribe` без `token` удалял **все** FCM-устройства логина (свежий WKWebView не держал токен в памяти). API на `haulz.space` теперь требует `token`. В приложении «Включено» только после сохранённого FCM-токена; ошибка Firebase/plist показывается на экране, а не маскируется разрешением iOS.
- Симулятор.

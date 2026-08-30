# Сборка HAULZ iOS (Capacitor)

Приложение: **HAULZ** (`ru.haulz.miniapp`).  
API в нативной сборке: **`https://haulz.space`** (как у Android APK).  
Нужен **Mac + Xcode** — Linux/Cloud не собирает `.app` / IPA.

Версия в Xcode: **1.3.24** (`MARKETING_VERSION`), build **1** (`CURRENT_PROJECT_VERSION`).

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
git checkout -B cursor/ios-capacitor-fd2d origin/cursor/ios-capacitor-fd2d
npm install
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
3. **TestFlight / App Store** — отдельно: Apple Developer Program, запись приложения в App Store Connect, **Product → Archive**. Пока в репозитории этого нет.

Не публикуйте IPA на `app.haulz.space` — это канал только для Android APK.

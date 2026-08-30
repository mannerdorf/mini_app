# Сборка HAULZ iOS (Capacitor)

Приложение: **HAULZ** (`ru.haulz.miniapp`).  
API в нативной сборке: **`https://haulz.space`** (как у Android APK).  
Нужен **Mac + Xcode** — Linux/Cloud не собирает `.app` / IPA.

Версия в Xcode: **1.3.24** (`MARKETING_VERSION`), build **1** (`CURRENT_PROJECT_VERSION`).

## Требования (Intel Mac)

- Xcode **26.3** Universal в `/Applications/Xcode.app`  
  (`xcode-select -p` → `/Applications/Xcode.app/Contents/Developer`)
- Node.js ≥ 18
- CocoaPods: `brew install cocoapods`

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
xcodebuild -version
```

## Сборка и запуск

```bash
cd ~/mini_app
git fetch origin
git checkout -B cursor/ios-capacitor-fd2d origin/cursor/ios-capacitor-fd2d
npm install

npm run ios:sync
npx cap open ios
```

В Xcode:

1. Выберите симулятор (iPhone) или свой iPhone.
2. **Signing & Capabilities** → Team (Apple ID; для устройства нужен аккаунт разработчика).
3. **Product → Run** (⌘R).

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

## App Store / TestFlight

Пока не настроено. Для IPA нужен Apple Developer Program, Team в Signing, затем **Product → Archive**. Push (APNs) на iOS отдельно от Android FCM — в этой сборке пуш-настройки профиля остаются Android-only.

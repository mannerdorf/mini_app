---
name: haulz-ios-rebuild
description: >-
  HAULZ iOS rebuild on Mac (Capacitor + Xcode + TestFlight). Use when the user
  asks for «пересборка ios», «правило пересборки ios», «собери iphone», or iOS
  release after main is updated. Mac + Xcode only — no Linux APK-style VPS deploy.
---

# HAULZ iOS — пересборка (Mac, 3 этапа)

Приложение: **HAULZ** (`ru.haulz.miniapp`). API: **`https://haulz.space`**.  
TestFlight / App Store — **не** `app.haulz.space` (только Android APK).

На экране «Уведомления» должна быть метка **`push-js 9`** — иначе TestFlight старый.

---

## Этап 1 — синхронизация

```bash
cd ~/mini_app
git checkout -- ios/App/App.xcodeproj/project.pbxproj
git pull origin main --ff-only
grep -E "MARKETING_VERSION|CURRENT_PROJECT_VERSION" ios/App/App.xcodeproj/project.pbxproj | head -4
```

Проверка `GoogleService-Info.plist` (не в git):

```bash
test -f ios/App/App/GoogleService-Info.plist && echo OK || echo "Нужен plist из Firebase Console"
```

CocoaPods (один раз или после обновления Podfile):

```bash
NONINTERACTIVE=1 brew install cocoapods   # если pod: command not found
```

---

## Этап 2 — web + Capacitor sync

```bash
npm ci
npm run ios:sync
cd ios/App && pod install && cd ../..
```

Открыть Xcode (**workspace**, не xcodeproj):

```bash
npx cap open ios
```

В Xcode:

1. **TARGETS → App → Signing & Capabilities** → Team (платная команда для TestFlight).
2. Destination: **Any iOS Device (arm64)** для Archive; симулятор — для локальной проверки.
3. **Product → Archive** → **Distribute App** → App Store Connect → Upload.

Симулятор из терминала (без подписи):

```bash
npm run ios:release
```

---

## Этап 3 — TestFlight

1. [App Store Connect](https://appstoreconnect.apple.com) → HAULZ → **TestFlight**.
2. Дождаться обработки билда (10–40 мин).
3. Internal / External testing → тестеры ставят через приложение **TestFlight**.

Проверка в приложении на iPhone:

- **Профиль → Уведомления** — строка `push-js 9`, push можно включить.
- Переключить компанию в шапке — автопуш по выбранному ИНН (без служебного режима).

---

## Intel Mac: симулятор падает в libobjc

```bash
xcodebuild -downloadPlatform iOS -architectureVariant universal
cd ios/App && pod install && cd ../..
```

Destination — **iPhone Simulator**, не My Mac.

---

## Файлы

| Что | Где |
|-----|-----|
| Версия iOS | `ios/App/App.xcodeproj` → `MARKETING_VERSION`, `CURRENT_PROJECT_VERSION` |
| Firebase plist | `ios/App/App/GoogleService-Info.plist` (local, .gitignore) |
| Сборка | `scripts/build-ios.sh`, `npm run ios:sync` |
| Подробнее | `docs/IOS.md` |

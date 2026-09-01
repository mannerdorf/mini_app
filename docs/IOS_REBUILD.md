# Пересборка iOS (Mac + Xcode)

Шпаргалка для TestFlight. Правило для агента: `.cursor/skills/haulz-ios-rebuild/SKILL.md`.

Скажи агенту: **«дай правило пересборки ios»**.

Текущая версия в Xcode: **1.3.28**, build **8**. Метка JS: **`push-js 8`**.

---

## Этап 1 — синхронизация

```bash
cd ~/mini_app
git checkout -- ios/App/App.xcodeproj/project.pbxproj
git pull origin main --ff-only
grep -E "MARKETING_VERSION|CURRENT_PROJECT_VERSION" ios/App/App.xcodeproj/project.pbxproj | head -4
test -f ios/App/App/GoogleService-Info.plist && echo OK || echo "Скачайте plist из Firebase"
```

---

## Этап 2 — sync и сборка

```bash
npm ci
npm run ios:sync
cd ios/App && pod install && cd ../..
npx cap open ios
```

В Xcode: **Any iOS Device** → **Product → Archive** → Upload в App Store Connect.

---

## Этап 3 — TestFlight

App Store Connect → TestFlight → дождаться обработки → добавить тестеров.

На iPhone: приложение **TestFlight** → установить HAULZ → проверить **Профиль → Уведомления** (`push-js 8`).

---

Полная документация: [IOS.md](./IOS.md) (Firebase, APNs, signing).

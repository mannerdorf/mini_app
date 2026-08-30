---
name: haulz-ios-release
description: >-
  HAULZ iOS Capacitor app (Xcode). Use when the user asks to build/assemble
  the iOS app, open Xcode, make an IPA, or says «собери приложение» after
  installing Xcode. This is NOT the Android APK skill.
---

# HAULZ iOS (Capacitor)

## Standing rules

1. **iOS ≠ Android.** «Собери приложение» после установки Xcode = этот skill.
   Android APK — только если явно сказали APK / `app.haulz.space` / gradle.
2. Native `.app` / IPA **только на Mac + Xcode**. Do not invent Linux IPA builds
   or a new signing identity. Do not generate an Android keystore as a substitute.
3. Bundle id: `ru.haulz.miniapp`. API in the web bundle: `VITE_API_ORIGIN=https://haulz.space`.

## Algorithm (Mac — Intel, Xcode 26.3)

```bash
cd ~/mini_app
git fetch origin
git checkout -B cursor/ios-capacitor-fd2d origin/cursor/ios-capacitor-fd2d
# or the current iOS release branch

xcode-select -p
# expect: /Applications/Xcode.app/Contents/Developer

npm install
npm run ios:sync
npx cap open ios
```

In Xcode: simulator or device → Signing Team → Product → Run.

CLI simulator (unsigned):

```bash
npm run ios:release
```

Docs: `docs/IOS.md`. Version source: `ios/App/App.xcodeproj/project.pbxproj`
(`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`).

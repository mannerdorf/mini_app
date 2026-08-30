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
4. CocoaPods: give **one** command, `NONINTERACTIVE=1 brew install cocoapods`.
   Never paste a multi-command block into brew’s `[y/n]` prompt. Wait for `pod --version`.

## Algorithm (Mac — Intel, Xcode 26.3)

```bash
cd ~/mini_app
git fetch origin
git checkout -B cursor/ios-capacitor-fd2d origin/cursor/ios-capacitor-fd2d

xcode-select -p
# expect: /Applications/Xcode.app/Contents/Developer

npm install
NONINTERACTIVE=1 brew install cocoapods
pod --version
npm run ios:sync
npx cap open ios
```

Open **App.xcworkspace**, not `.xcodeproj`. Destination = iPhone Simulator (not My Mac).

Intel + Xcode 26: if launch crashes in `libobjc.A.dylib` `readClass`, the iOS simulator runtime is arm64-only. One command:

```bash
xcodebuild -downloadPlatform iOS -architectureVariant universal
```

If that prints `No needed downloadables found for universal`, the runtime is already installed. Skip the download. `git pull`, then `cd ios/App && pod install`, open **App.xcworkspace**, Clean Build Folder, Run on iPhone Simulator.

TestFlight needs a **paid** Apple Developer Program team (not Personal Team). App Store Connect app with bundle id `ru.haulz.miniapp`, then Xcode Product → Archive → Distribute App → App Store Connect. Bump `CURRENT_PROJECT_VERSION` on every upload. See `docs/IOS.md` section TestFlight. Do not upload IPA to `app.haulz.space`.

CLI simulator (unsigned):

```bash
npm run ios:release
```

Docs: `docs/IOS.md`. Version source: `ios/App/App.xcodeproj/project.pbxproj`
(`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION`).

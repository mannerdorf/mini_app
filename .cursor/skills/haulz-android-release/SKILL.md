---
name: haulz-android-release
description: >-
  HAULZ Android APK publish algorithm (Mac). Always bump versionCode/versionName
  without waiting for the user to ask. Follow this publish scheme exactly — do
  not invent alternative scp/deploy paths.
---

# HAULZ Android release

## Standing rules (owner)

1. **Always bump** `android/app/build.gradle`: `versionCode` (+1 vs live) and `versionName` when shipping an APK. Do not wait for the user to ask.
2. Before bumping, check live: `curl -sS https://app.haulz.space/version.json`
3. Publish **only** with the algorithm below. Do not invent other upload schemes.
4. **Not iOS.** If the user just installed Xcode or says «собери приложение» without APK/`app.haulz.space`, use `haulz-ios-release`.

## Algorithm (always)

### 1) Mac — собрать

```bash
cd ~/mini_app
git fetch origin
git checkout -B <release-branch> origin/<release-branch>
# or for main: git checkout -B main origin/main

export JAVA_HOME="/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
# External disk (optional): export ANDROID_HOME="/Volumes/Cursor/haulz-build/android-sdk"

npm run android:release

export ANDROID_RELEASE_NOTES='…краткие notes…'
./scripts/deploy-android-release.sh dist/haulz-miniapp-release.apk --local
cat dist/android-release/version.json
```

Ожидай в `version.json` новые `versionName` / `versionCode` из `build.gradle`.

### 2) Mac → VPS APK (`200.165.236.49`) — выложить

```bash
ssh root@200.165.236.49 'mkdir -p /var/www/app.haulz.space/releases'

scp ~/mini_app/dist/android-release/latest.apk \
    ~/mini_app/dist/android-release/version.json \
    ~/mini_app/dist/android-release/index.html \
    root@200.165.236.49:/var/www/app.haulz.space/

scp ~/mini_app/dist/android-release/releases/haulz-miniapp-<versionName>.apk \
    root@200.165.236.49:/var/www/app.haulz.space/releases/
```

### 3) Mac — проверить

```bash
curl -sS https://app.haulz.space/version.json
```

## Repo

- Version source: `android/app/build.gradle`
- Commit the bump with the feature that needs a new APK, push `main` (or the release branch) before Mac build.

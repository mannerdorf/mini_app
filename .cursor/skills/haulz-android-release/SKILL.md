---
name: haulz-android-release
description: >-
  HAULZ Android APK version bump and publish scheme. Use whenever shipping
  Capacitor/Android UI, native, push, or guest changes that should land in the
  APK — always bump versionCode/versionName without waiting for the user to ask.
---

# HAULZ Android release

## Standing rule (owner)

**Always bump** `android/app/build.gradle` `versionCode` (+1) and `versionName` (semver patch unless told otherwise) when preparing an APK that should update over the live build on `app.haulz.space`. Do **not** wait for the user to ask.

Before bumping, check live:

```bash
curl -sS https://app.haulz.space/version.json
```

New `versionCode` must be **greater** than remote `versionCode`.

## Publish scheme (Mac only — do not invent alternatives)

```bash
cd ~/mini_app
git pull
npm run android:release
./scripts/deploy-android-release.sh dist/haulz-miniapp-release.apk --local
scp -r ~/mini_app/dist/android-release/* root@200.165.236.49:/var/www/app.haulz.space/
curl -sS https://app.haulz.space/version.json
```

## Repo

- Version source: `android/app/build.gradle` (`versionCode`, `versionName`)
- Commit the bump with the feature that needs a new APK, then push `main` (or the release branch).

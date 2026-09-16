# Пересборка Android APK (Mac)

Краткая шпаргалка для релиза на **app.haulz.space**.  
Полное правило для агента: `.cursor/skills/haulz-android-rebuild/SKILL.md`.

Скажи агенту: **«дай правило пересборки android»** — он выдаст эти 3 этапа.

---

## Этап 1 — синхронизация и версия

```bash
cd ~/mini_app
git checkout -- android/app/build.gradle
git pull origin main --ff-only
grep -E "versionCode|versionName" android/app/build.gradle
curl -sS https://app.haulz.space/version.json
```

`versionCode` в `build.gradle` должен быть **больше**, чем на сервере.  
Если нет — `./scripts/bump-android-version.sh`, commit, push, снова `git pull`.

---

## Этап 2 — пересборка

```bash
export ANDROID_HOME="/Volumes/Cursor/haulz-build/android-sdk"
export GRADLE_USER_HOME="/Volumes/Cursor/haulz-build/gradle-home"
export TMPDIR="/Volumes/Cursor/haulz-build/tmp"
export PATH="$PATH:$ANDROID_HOME/platform-tools"
export JAVA_HOME="/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
export PATH="$JAVA_HOME/bin:$PATH"

npm run android:release

export ANDROID_RELEASE_NOTES='кратко: что в релизе'
./scripts/deploy-android-release.sh dist/haulz-miniapp-release.apk --local

cat dist/android-release/version.json
```

---

## Этап 3 — публикация

```bash
VERSION="$(grep versionName android/app/build.gradle | head -1 | sed 's/.*"\(.*\)".*/\1/')"

ssh root@200.165.236.49 'mkdir -p /var/www/app.haulz.space/releases'

scp ~/mini_app/dist/android-release/latest.apk \
    ~/mini_app/dist/android-release/version.json \
    ~/mini_app/dist/android-release/index.html \
    root@200.165.236.49:/var/www/app.haulz.space/

scp ~/mini_app/dist/android-release/releases/haulz-miniapp-${VERSION}.apk \
    root@200.165.236.49:/var/www/app.haulz.space/releases/

curl -sS https://app.haulz.space/version.json
```

---

## Частые проблемы

| Ошибка | Решение |
|--------|---------|
| `@capacitor/filesystem` not resolved | `npm ci`, затем снова `npm run android:release` |
| `versionCode` не больше серверного | `./scripts/bump-android-version.sh`, push в `main` |
| SSH `Permission denied (publickey,password)` | Публичный ключ Mac → `/root/.ssh/authorized_keys` на VPS (Timeweb консоль / VNC). Затем: `export ANDROID_RELEASE_SSH_IDENTITY=~/.ssh/haulz_android_vps` и `./scripts/deploy-android-vps.sh` |
| SSH на `200.165.236.49` | Деплой только с Mac (cloud agent не имеет вашего ключа) |
| `Network is unreachable` к VPS | DNS/VPN: `curl https://haulz.space` может работать, а ICMP/SSH — нет; повторить позже или другая сеть |
| Gradle cache corrupt на `/Volumes/Cursor/...` | `./gradlew --stop`; `rm -rf "$GRADLE_USER_HOME/caches/journal-1"` или перенести `GRADLE_USER_HOME` на диск с местом |

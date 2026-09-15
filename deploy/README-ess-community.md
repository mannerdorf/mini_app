# ESS Community — отдельный VPS

Самостоятельный Matrix-стек Element (Synapse + Element Web + MAS + звонки) на **отдельной** машине. Не ставить на `haulz-api` / cron VPS.

Официально: [ESS Community](https://github.com/element-hq/ess-helm) (AGPL, до ~100 пользователей, **non-commercial**). Для корпоративного HAULZ позже — ESS Pro.

## Что получится

| URL | Роль |
|-----|------|
| `https://chat.haulz.space` | Element Web (открывать это) |
| `https://admin.chat.haulz.space` | Element Admin |
| `https://account.chat.haulz.space` | вход / MAS |
| `https://matrix.chat.haulz.space` | Synapse API |
| `https://mrtc.chat.haulz.space` | звонки Element Call |

MXID: `@имя:chat.haulz.space`. **Server name нельзя сменить** без сброса базы.

Клиенты с [element.io/download](https://element.io/download) → свой сервер **`chat.haulz.space`**.

Публичная регистрация выключена. Федерация закрыта (`federation_domain_whitelist: []`).

---

## 1. Создать VPS в Timeweb Cloud

Новый облачный сервер, **не** `haulzbackend` и не cron.

| Параметр | Значение |
|----------|----------|
| ОС | Ubuntu 24.04 |
| RAM | **4 GB** (минимум ESS — 2 GB, мало для Postgres+Synapse+LiveKit) |
| CPU | 2 vCPU |
| Диск | 80 GB (медиа растёт) |
| Сеть | публичный IPv4 |
| Имя | `haulz-ess` |

В файрволе Timeweb открыть:

- TCP `22`, `80`, `443`
- TCP `30001` (WebRTC / MatrixRTC)
- UDP `30002` (WebRTC / MatrixRTC)
- TCP **и** UDP `3478` (coturn TURN, 1:1 звонки Element)
- UDP `49152-49300` (реле coturn)

SSH-ключ тот же, что на остальных HAULZ VPS.

## 2. DNS (Timeweb → домен `haulz.space`)

VPS `haulz-ess`: **`200.169.177.129`** (`msk-1-vm-mhhx`). Не трогать `@`, `www`, `api`, `app`.

Панель: **Домены** → `haulz.space` → **DNS-записи** — достаточно **двух** A:

| Тип | Имя (поддомен) | Значение | TTL |
|-----|----------------|----------|-----|
| A | `chat` | `200.169.177.129` | 300 |
| A | `*.chat` | `200.169.177.129` | 300 |

Если Timeweb не принимает `*.chat`, добавьте явно:

| Тип | Имя | Значение |
|-----|------|----------|
| A | `chat` | `200.169.177.129` |
| A | `matrix.chat` | `200.169.177.129` |
| A | `admin.chat` | `200.169.177.129` |
| A | `account.chat` | `200.169.177.129` |
| A | `mrtc.chat` | `200.169.177.129` |

Проверка (все → `200.169.177.129`):

```bash
for h in chat.haulz.space matrix.chat.haulz.space admin.chat.haulz.space account.chat.haulz.space mrtc.chat.haulz.space; do
  echo -n "$h "; getent ahostsv4 "$h" | awk '{print $1; exit}'
done
```

Let's Encrypt не выпустит сертификаты, пока DNS не смотрит на этот VPS.

## 3. Установка (root на новом VPS)

До мержа в `main` укажите ветку с файлами:

```bash
export HAULZ_GIT_REF=cursor/ess-community-vps-fd2d
export ESS_ACME_EMAIL=info@haulz.pro
bash -s < <(curl -fsSL "https://raw.githubusercontent.com/mannerdorf/mini_app/${HAULZ_GIT_REF}/deploy/setup-ess-community-vps.sh")
```

Или после clone:

```bash
sudo mkdir -p /opt/haulz
sudo git clone --branch cursor/ess-community-vps-fd2d \
  https://github.com/mannerdorf/mini_app.git /opt/haulz/app
ESS_ACME_EMAIL=info@haulz.pro bash /opt/haulz/app/deploy/setup-ess-community-vps.sh
```

Скрипт:

1. Отказывается работать, если видит `haulz-api` / `haulz-cron`
2. Ставит swap 2G, ufw, k3s, helm, cert-manager
3. Ставит Helm-чарт `oci://ghcr.io/element-hq/ess-helm/matrix-stack` версии **26.8.1** (`ESS_CHART_VERSION`)
4. Кладёт values в `/opt/haulz/ess-config-values`

Первый прогон 15–25 минут (образы). Postgres — встроенный в чарт (для старта). Отдельный Timeweb DBaaS — позже, `docs` ESS advanced.

## 4. Первый пользователь

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
k3s kubectl exec -n ess -it deploy/ess-matrix-authentication-service -- mas-cli manage register-user
```

Задать username + password. Войти на **`https://chat.haulz.space`**.

## 5. Проверка

```bash
bash /opt/haulz/app/deploy/ess-community/verify.sh
k3s kubectl get pods -n ess
```

С телефона: Element X / Element → свой сервер **`chat.haulz.space`**.

## Обслуживание

Values на сервере: `/opt/haulz/ess-config-values/`. После правок:

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
TURN_F=""
[[ -f /opt/haulz/ess-config-values/turn.yaml ]] && TURN_F="-f /opt/haulz/ess-config-values/turn.yaml"
helm upgrade --install --namespace ess ess \
  oci://ghcr.io/element-hq/ess-helm/matrix-stack \
  --version 26.8.1 \
  -f /opt/haulz/ess-config-values/hostnames.yaml \
  -f /opt/haulz/ess-config-values/tls.yaml \
  -f /opt/haulz/ess-config-values/extra.yaml \
  $TURN_F \
  --timeout 25m --wait
```

Бэкап PVC:

```bash
k3s kubectl get pvc -n ess
```

Снести всё: см. [uninstall в ess-helm](https://github.com/element-hq/ess-helm#uninstalling) + `/usr/local/bin/k3s-uninstall.sh`.

## Звонки 1:1 (TURN)

Element на телефоне без TURN показывает: *«Попросите администратора … matrix.chat.haulz.space настроить сервер TURN»*.  
Кнопка **turn.matrix.org** — временный обход: чужой сервер видит IP, из РФ часто не работает.

На ESS VPS (`200.169.177.129`):

```bash
cd /opt/haulz/app
git fetch origin
git checkout -B cursor/ess-turn-fd2d origin/cursor/ess-turn-fd2d
bash deploy/ess-community/install-coturn.sh
```

Скрипт ставит **coturn** на хост, пишет секрет в `/opt/haulz/ess-config-values/` (не в git) и делает `helm upgrade` Synapse с `turn_uris` на `turn.chat.haulz.space` (покрывается `*.chat`).

В **Timeweb → Security Group** этой машины откройте TCP/UDP **3478** и UDP **49152–49300**. ufw скрипт откроет сам; облачный фаервол — вручную.

После установки в Element: выйти из аккаунта и войти снова. Не жмите Delete у ключей.

## Если не стартует

- `helm status ess -n ess` и `k3s kubectl describe pod -n ess`
- сертификаты: `k3s kubectl get certificate -A`
- DNS снова на этот IP
- RAM: `free -h` — при OOM увеличьте VPS до 8 GB
- RU VPS и `ghcr.io`: если pull зависает — повтор скрипта или зеркало Docker

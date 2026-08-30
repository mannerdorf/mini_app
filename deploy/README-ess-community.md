# ESS Community — отдельный VPS

Самостоятельный Matrix-стек Element (Synapse + Element Web + MAS + звонки) на **отдельной** машине. Не ставить на `haulz-api` / cron VPS.

Официально: [ESS Community](https://github.com/element-hq/ess-helm) (AGPL, до ~100 пользователей, **non-commercial**). Для корпоративного HAULZ позже — ESS Pro.

## Что получится

| URL | Роль |
|-----|------|
| `https://chat.haulz.space` | Element Web (чат в браузере) |
| `https://admin.haulz.space` | Element Admin |
| `https://account.haulz.space` | вход / MAS |
| `https://synapse.haulz.space` | Matrix Client-Server API |
| `https://mrtc.haulz.space` | звонки Element Call |
| `https://matrix.haulz.space` | server name + `/.well-known` |

MXID: `@имя:matrix.haulz.space`. **Server name нельзя сменить** без сброса базы.

Клиенты с [element.io/download](https://element.io/download) логинятся на homeserver `matrix.haulz.space`.

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
- TCP `30001` (WebRTC)
- UDP `30002` (WebRTC)

SSH-ключ тот же, что на остальных HAULZ VPS.

## 2. DNS (Timeweb → домен `haulz.space`)

Все **A** → IPv4 нового VPS. Не трогать `@`, `www`, `api`, `app`.

| Тип | Имя | Значение |
|-----|------|----------|
| A | `matrix` | IP `haulz-ess` |
| A | `synapse` | тот же IP |
| A | `chat` | тот же IP |
| A | `admin` | тот же IP |
| A | `account` | тот же IP |
| A | `mrtc` | тот же IP |

Подождать резолв:

```bash
for h in matrix synapse chat admin account mrtc; do
  echo -n "$h.haulz.space "; getent ahostsv4 "$h.haulz.space" | awk '{print $1; exit}'
done
```

Let's Encrypt не выпустит сертификаты, пока A-записи не смотрят на этот VPS.

## 3. Установка (root на новом VPS)

До мержа в `main` укажите ветку с файлами:

```bash
export HAULZ_GIT_REF=cursor/ess-community-vps-fd2d
export ESS_ACME_EMAIL=ops@haulz.space   # реальный ящик для expiry Let's Encrypt
bash -s < <(curl -fsSL "https://raw.githubusercontent.com/mannerdorf/mini_app/${HAULZ_GIT_REF}/deploy/setup-ess-community-vps.sh")
```

Или после clone:

```bash
sudo mkdir -p /opt/haulz
sudo git clone --branch cursor/ess-community-vps-fd2d \
  https://github.com/mannerdorf/mini_app.git /opt/haulz/app
ESS_ACME_EMAIL=ops@haulz.space bash /opt/haulz/app/deploy/setup-ess-community-vps.sh
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

Задать username + password. Войти на `https://chat.haulz.space`.

## 5. Проверка

```bash
bash /opt/haulz/app/deploy/ess-community/verify.sh
k3s kubectl get pods -n ess
```

С телефона: Element X / Element → свой сервер `matrix.haulz.space`.

## Обслуживание

Values на сервере: `/opt/haulz/ess-config-values/`. После правок:

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
helm upgrade --install --namespace ess ess \
  oci://ghcr.io/element-hq/ess-helm/matrix-stack \
  --version 26.8.1 \
  -f /opt/haulz/ess-config-values/hostnames.yaml \
  -f /opt/haulz/ess-config-values/tls.yaml \
  -f /opt/haulz/ess-config-values/extra.yaml \
  --timeout 25m --wait
```

Бэкап PVC:

```bash
k3s kubectl get pvc -n ess
```

Снести всё: см. [uninstall в ess-helm](https://github.com/element-hq/ess-helm#uninstalling) + `/usr/local/bin/k3s-uninstall.sh`.

## Если не стартует

- `helm status ess -n ess` и `k3s kubectl describe pod -n ess`
- сертификаты: `k3s kubectl get certificate -A`
- DNS снова на этот IP
- RAM: `free -h` — при OOM увеличьте VPS до 8 GB
- RU VPS и `ghcr.io`: если pull зависает — повтор скрипта или зеркало Docker

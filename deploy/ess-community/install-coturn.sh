#!/usr/bin/env bash
# Coturn на хосте ESS VPS + turn.yaml для Synapse.
# Нужен для 1:1 звонков Element (iOS/Android), иначе диалог
# «настройте сервер TURN» / turn.matrix.org.
#
#   bash /opt/haulz/app/deploy/ess-community/install-coturn.sh
#
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

ESS_VALUES_DIR="${ESS_VALUES_DIR:-/opt/haulz/ess-config-values}"
ESS_CHART_VERSION="${ESS_CHART_VERSION:-26.8.1}"
TURN_HOST="${TURN_HOST:-turn.chat.haulz.space}"
SECRET_FILE="$ESS_VALUES_DIR/turn-shared-secret"
CONF=/etc/turnserver.conf
KUBECONFIG_PATH="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"

mkdir -p "$ESS_VALUES_DIR"
chmod 700 "$ESS_VALUES_DIR"

if [[ ! -f "$SECRET_FILE" ]]; then
  umask 077
  openssl rand -hex 32 > "$SECRET_FILE"
  chmod 600 "$SECRET_FILE"
  echo "==> новый TURN shared secret → $SECRET_FILE"
fi
SECRET="$(tr -d '[:space:]' < "$SECRET_FILE")"
if [[ -z "$SECRET" ]]; then
  echo "ERROR: пустой $SECRET_FILE" >&2
  exit 1
fi

THIS_IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org || curl -4 -fsS --max-time 10 https://ifconfig.me)"
if [[ -z "$THIS_IP" ]]; then
  echo "ERROR: не удалось определить публичный IPv4" >&2
  exit 1
fi
echo "==> external-ip $THIS_IP  realm $TURN_HOST"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq coturn openssl

cat > "$CONF" <<EOF
listening-port=3478
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=${SECRET}
realm=${TURN_HOST}
server-name=${TURN_HOST}
external-ip=${THIS_IP}
min-port=49152
max-port=49300
no-cli
no-tls
no-dtls
no-multicast-peers
no-loopback-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
verbose
EOF
chmod 640 "$CONF"

if [[ -f /etc/default/coturn ]]; then
  sed -i 's/^#*TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn
  grep -q '^TURNSERVER_ENABLED=1' /etc/default/coturn || echo 'TURNSERVER_ENABLED=1' >> /etc/default/coturn
fi

ufw allow 3478/tcp comment 'coturn TURN TCP' || true
ufw allow 3478/udp comment 'coturn TURN UDP' || true
ufw allow 49152:49300/udp comment 'coturn UDP relay' || true

systemctl enable --now coturn
systemctl restart coturn
sleep 1
systemctl --no-pager --full status coturn | head -20 || true

cat > "$ESS_VALUES_DIR/turn.yaml" <<EOF
# Сгенерировано install-coturn.sh — не коммитить (секрет).
synapse:
  additional:
    2-turn:
      config: |
        turn_uris:
          - "turn:${TURN_HOST}:3478?transport=udp"
          - "turn:${TURN_HOST}:3478?transport=tcp"
        turn_shared_secret: "${SECRET}"
        turn_user_lifetime: 86400000
        turn_allow_guests: false
EOF
chmod 600 "$ESS_VALUES_DIR/turn.yaml"

if [[ -f "$KUBECONFIG_PATH" ]]; then
  export KUBECONFIG="$KUBECONFIG_PATH"
elif [[ -f /root/.kube/config ]]; then
  export KUBECONFIG=/root/.kube/config
fi

if command -v helm >/dev/null 2>&1 && helm status ess -n ess >/dev/null 2>&1; then
  echo "==> helm upgrade ess (+ turn.yaml)"
  helm upgrade --install --namespace ess ess \
    oci://ghcr.io/element-hq/ess-helm/matrix-stack \
    --version "$ESS_CHART_VERSION" \
    -f "$ESS_VALUES_DIR/hostnames.yaml" \
    -f "$ESS_VALUES_DIR/tls.yaml" \
    -f "$ESS_VALUES_DIR/extra.yaml" \
    -f "$ESS_VALUES_DIR/turn.yaml" \
    --timeout 25m \
    --wait
else
  echo "==> helm release ess ещё нет — turn.yaml будет подхвачен setup-ess-community-vps.sh"
fi

echo
echo "ok — coturn на ${THIS_IP}:3478 (UDP/TCP), relay UDP 49152-49300"
echo "ok — Synapse TURN: turn:${TURN_HOST}:3478"
echo "В Timeweb Security Group откройте: TCP 3478, UDP 3478, UDP 49152-49300"
echo "Клиенты Element: выйти и войти снова (кэш voip/turnServer)."

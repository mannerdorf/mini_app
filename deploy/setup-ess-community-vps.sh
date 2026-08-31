#!/usr/bin/env bash
# Первичная установка ESS Community на ОТДЕЛЬНЫЙ Ubuntu 24.04 VPS.
# Не запускать на haulz-api / cron VPS.
#
#   ESS_ACME_EMAIL=ops@haulz.space bash deploy/setup-ess-community-vps.sh
#
set -euo pipefail

APP_DIR="${HAULZ_APP_DIR:-/opt/haulz/app}"
REPO="${HAULZ_GIT_REPO:-https://github.com/mannerdorf/mini_app.git}"
GIT_REF="${HAULZ_GIT_REF:-main}"
ESS_VALUES_DIR="${ESS_VALUES_DIR:-/opt/haulz/ess-config-values}"
KUBECONFIG_PATH="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"
CERT_MANAGER_VERSION="${CERT_MANAGER_VERSION:-v1.17.0}"
ESS_CHART_VERSION="${ESS_CHART_VERSION:-26.8.1}"
ESS_ACME_EMAIL="${ESS_ACME_EMAIL:-}"

HOSTS=(
  chat.haulz.space
  matrix.chat.haulz.space
  admin.chat.haulz.space
  account.chat.haulz.space
  mrtc.chat.haulz.space
)

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root" >&2
  exit 1
fi

if [[ -z "$ESS_ACME_EMAIL" ]]; then
  echo "ERROR: задайте ESS_ACME_EMAIL (для Let's Encrypt), например:" >&2
  echo "  ESS_ACME_EMAIL=ops@haulz.space bash deploy/setup-ess-community-vps.sh" >&2
  exit 1
fi

if [[ -f /etc/systemd/system/haulz-api.service ]] || [[ -f /etc/systemd/system/haulz-cron.service ]]; then
  echo "ERROR: это VPS HAULZ API/cron. ESS Community ставим только на отдельную машину." >&2
  exit 1
fi

if systemctl is-active --quiet nginx 2>/dev/null || systemctl is-active --quiet apache2 2>/dev/null; then
  echo "ERROR: nginx/apache занимает 80/443. ESS нужен чистый VPS (k3s Traefik слушает 80/443)." >&2
  exit 1
fi

ESS_SRC=""
resolve_ess_src() {
  local candidates=(
    "$APP_DIR/deploy/ess-community"
    "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/ess-community"
  )
  local d
  for d in "${candidates[@]}"; do
    if [[ -f "$d/hostnames.yaml" ]]; then
      ESS_SRC="$d"
      return 0
    fi
  done
  return 1
}

echo "==> packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates dnsutils ufw

mkdir -p /opt/haulz
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone --branch "$GIT_REF" --single-branch "$REPO" "$APP_DIR"
else
  git -C "$APP_DIR" fetch origin "$GIT_REF" 2>/dev/null || git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout "$GIT_REF" 2>/dev/null || true
  git -C "$APP_DIR" pull --ff-only origin "$GIT_REF" 2>/dev/null || true
fi

if ! resolve_ess_src; then
  echo "ERROR: нет $APP_DIR/deploy/ess-community — проверьте HAULZ_GIT_REF (ветка с ESS-файлами)." >&2
  exit 1
fi

echo "==> swap 2G (Synapse+Postgres на 4 GB RAM)"
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 30001/tcp comment 'Matrix RTC TCP'
ufw allow 30002/udp comment 'Matrix RTC UDP'
ufw allow 3478/tcp comment 'coturn TURN TCP'
ufw allow 3478/udp comment 'coturn TURN UDP'
ufw allow 49152:49300/udp comment 'coturn UDP relay'
ufw --force enable

echo "==> DNS check"
THIS_IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org || curl -4 -fsS --max-time 10 https://ifconfig.me)"
echo "    this VPS IPv4: $THIS_IP"
DNS_OK=1
if [[ "${SKIP_DNS_CHECK:-0}" != "1" ]]; then
  for host in "${HOSTS[@]}"; do
    resolved="$(getent ahostsv4 "$host" 2>/dev/null | awk '{print $1; exit}' || true)"
    if [[ -z "$resolved" ]]; then
      echo "    FAIL  $host  (нет A-записи)" >&2
      DNS_OK=0
    elif [[ "$resolved" != "$THIS_IP" ]]; then
      echo "    FAIL  $host  → $resolved  (ожидали $THIS_IP)" >&2
      DNS_OK=0
    else
      echo "    ok    $host  → $resolved"
    fi
  done
  if [[ "$DNS_OK" -ne 1 ]]; then
    echo "ERROR: DNS должен указывать на этот VPS до Let's Encrypt." >&2
    echo "       Timeweb haulz.space: A  chat → $THIS_IP  и  A  *.chat → $THIS_IP" >&2
    echo "       (временный обход: SKIP_DNS_CHECK=1 — сертификаты, скорее всего, не выпустятся)" >&2
    exit 1
  fi
fi

echo "==> k3s"
if [[ ! -x /usr/local/bin/k3s ]]; then
  curl -sfL https://get.k3s.io | sh -
fi
systemctl enable --now k3s
for _ in $(seq 1 90); do
  if [[ -f /etc/rancher/k3s/k3s.yaml ]] && k3s kubectl get nodes >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
# manifests появляются после старта k3s, не в ту же секунду
mkdir -p /var/lib/rancher/k3s/server/manifests
k3s kubectl wait --for=condition=Ready node --all --timeout=180s || true
k3s kubectl get nodes

install -d -m 700 /root/.kube
k3s kubectl config view --raw > /root/.kube/config
chmod 600 /root/.kube/config
export KUBECONFIG="$KUBECONFIG_PATH"
if [[ ! -f "$KUBECONFIG" ]]; then
  export KUBECONFIG=/root/.kube/config
fi

install -m 644 "$ESS_SRC/traefik-config.yaml" /var/lib/rancher/k3s/server/manifests/traefik-config.yaml

echo "==> helm"
if ! command -v helm >/dev/null 2>&1; then
  curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
fi

echo "==> values → $ESS_VALUES_DIR"
mkdir -p "$ESS_VALUES_DIR"
cp -a "$ESS_SRC/hostnames.yaml" "$ESS_VALUES_DIR/hostnames.yaml"
cp -a "$ESS_SRC/tls.yaml" "$ESS_VALUES_DIR/tls.yaml"
cp -a "$ESS_SRC/extra.yaml" "$ESS_VALUES_DIR/extra.yaml"
sed "s|__ACME_EMAIL__|${ESS_ACME_EMAIL}|" "$ESS_SRC/cluster-issuer.yaml" > "$ESS_VALUES_DIR/cluster-issuer.yaml"

echo "==> namespace ess + well-known ConfigMap"
k3s kubectl get ns ess >/dev/null 2>&1 || k3s kubectl create namespace ess
k3s kubectl apply -f "$ESS_SRC/well-known-configmap.yaml"
k3s kubectl apply -f "$ESS_SRC/well-known-server.yaml"

echo "==> cert-manager $CERT_MANAGER_VERSION"
helm repo add jetstack https://charts.jetstack.io --force-update
if ! helm status cert-manager -n cert-manager >/dev/null 2>&1; then
  helm install cert-manager jetstack/cert-manager \
    --namespace cert-manager \
    --create-namespace \
    --version "$CERT_MANAGER_VERSION" \
    --set crds.enabled=true \
    --wait
else
  helm upgrade cert-manager jetstack/cert-manager \
    --namespace cert-manager \
    --version "$CERT_MANAGER_VERSION" \
    --set crds.enabled=true \
    --wait
fi

k3s kubectl apply -f "$ESS_VALUES_DIR/cluster-issuer.yaml"

echo "==> coturn (1:1 звонки Element)"
bash "$ESS_SRC/install-coturn.sh"

echo "==> ESS Community (helm, 15–20 мин на первый pull образов)"
TURN_VALUES=()
if [[ -f "$ESS_VALUES_DIR/turn.yaml" ]]; then
  TURN_VALUES=(-f "$ESS_VALUES_DIR/turn.yaml")
fi
helm upgrade --install --namespace ess ess \
  oci://ghcr.io/element-hq/ess-helm/matrix-stack \
  --version "$ESS_CHART_VERSION" \
  -f "$ESS_VALUES_DIR/hostnames.yaml" \
  -f "$ESS_VALUES_DIR/tls.yaml" \
  -f "$ESS_VALUES_DIR/extra.yaml" \
  "${TURN_VALUES[@]}" \
  --timeout 25m \
  --wait

echo
echo "==> pods"
k3s kubectl get pods -n ess
echo
echo "==> next:"
echo "  1. Создать админа:"
echo "     k3s kubectl exec -n ess -it deploy/ess-matrix-authentication-service -- mas-cli manage register-user"
echo "  2. Открыть https://chat.haulz.space"
echo "  3. Админка https://admin.chat.haulz.space"
echo "  4. Проверка: bash $APP_DIR/deploy/ess-community/verify.sh"
echo
echo "ESS Community — AGPL, до ~100 пользователей, non-commercial. Для рабочего HAULZ смотрите ESS Pro."

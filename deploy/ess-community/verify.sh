#!/usr/bin/env bash
# Проверка ESS Community после install.
set -euo pipefail

export KUBECONFIG="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"
if [[ ! -f "$KUBECONFIG" && -f /root/.kube/config ]]; then
  export KUBECONFIG=/root/.kube/config
fi

MUST=(
  https://chat.haulz.space/
  https://chat.haulz.space/.well-known/matrix/client
  https://admin.chat.haulz.space/
)
OPTIONAL=(
  https://chat.haulz.space/.well-known/matrix/server
  https://matrix.chat.haulz.space/health
  https://account.chat.haulz.space/health
)

ok_http() {
  case "$1" in
    200|204|301|302|303|307|308) return 0 ;;
    *) return 1 ;;
  esac
}

echo "==> k3s nodes"
k3s kubectl get nodes
echo
echo "==> ess pods"
k3s kubectl get pods -n ess
echo
echo "==> helm"
helm status ess -n ess
echo
echo "==> HTTPS (обязательные)"
fail=0
for url in "${MUST[@]}"; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$url" || echo 000)"
  echo "    $code  $url"
  if ! ok_http "$code"; then
    fail=1
  fi
done
echo "==> HTTPS (опциональные health)"
for url in "${OPTIONAL[@]}"; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$url" || echo 000)"
  echo "    $code  $url"
done

if [[ "$fail" -ne 0 ]]; then
  echo "ERROR: обязательные URL не отвечают 2xx/3xx" >&2
  exit 1
fi

echo
echo "ok — клиент: https://chat.haulz.space"
echo "ok — админ:  https://admin.chat.haulz.space"
echo "ok — MXID:   @имя:chat.haulz.space"
echo "homeserver в Element X: chat.haulz.space"

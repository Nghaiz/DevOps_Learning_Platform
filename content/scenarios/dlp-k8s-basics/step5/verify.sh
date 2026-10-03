#!/bin/bash
# Bước 5: /root/web-pod.yaml mô tả Pod web (nginx:1.27-alpine, app=web,tier=frontend)
# và Pod đó đang Ready trên cụm với đúng hai nhãn.
set -uo pipefail
export KUBECONFIG=/var/lib/dlp/k3s/kubeconfig.yaml
k() { kubectl --request-timeout=10s "$@"; }

if ! k get --raw /readyz >/dev/null 2>&1; then
  fail "Cụm Kubernetes trong sandbox đang trả lời (chưa: đợi vài giây rồi kiểm lại)"
  exit 1
fi

file=/root/web-pod.yaml
if [ ! -s "$file" ]; then
  fail "Có file $file (chưa có: chạy lệnh kubectl run … --dry-run=client -o yaml > web-pod.yaml)"
elif grep -q '^kind: Pod' "$file" && grep -q 'image: nginx:1.27-alpine' "$file" &&
  grep -q 'app: web' "$file" && grep -q 'tier: frontend' "$file"; then
  pass "$file mô tả Pod nginx:1.27-alpine với nhãn app=web, tier=frontend"
else
  fail "$file mô tả Pod nginx:1.27-alpine với nhãn app=web, tier=frontend (file thiếu một trong các dòng đó)"
fi

pod=$(k get pod web -n default -o json 2>/dev/null)
if [ -z "$pod" ]; then
  fail "Pod web có mặt trong namespace default (chưa có: kubectl apply -f web-pod.yaml)"
  exit 1
fi

labels=$(jq -r '.metadata.labels.app + "," + .metadata.labels.tier' <<<"$pod")
if [ "$labels" = "web,frontend" ]; then
  pass "Pod web mang nhãn app=web và tier=frontend"
else
  fail "Pod web mang nhãn app=web và tier=frontend (hiện: $(jq -c '.metadata.labels' <<<"$pod"))"
fi

ready=$(jq -r '.status.conditions[]? | select(.type == "Ready") | .status' <<<"$pod")
if [ "$ready" = "True" ]; then
  pass "Pod web đã Ready"
else
  fail "Pod web đã Ready (hiện: $(jq -r '.status.phase' <<<"$pod"))"
fi

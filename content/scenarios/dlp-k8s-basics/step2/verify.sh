#!/bin/bash
# Bước 2: Pod default/web chạy nginx:1.27-alpine và đã Ready.
# Đọc kubeconfig gốc do k3s ghi, không đọc ~/.kube/config: người học có thể đổi
# namespace mặc định trong file của họ, và lượt chấm không được đổi theo.
set -uo pipefail
export KUBECONFIG=/var/lib/dlp/k3s/kubeconfig.yaml
k() { kubectl --request-timeout=10s "$@"; }

if ! k get --raw /readyz >/dev/null 2>&1; then
  fail "Cụm Kubernetes trong sandbox đang trả lời (chưa: đợi vài giây rồi kiểm lại)"
  exit 1
fi

pod=$(k get pod web -n default -o json 2>/dev/null)
if [ -z "$pod" ]; then
  fail "Có Pod web trong namespace default (chưa có: kubectl run web --image=nginx:1.27-alpine)"
  exit 1
fi
pass "Có Pod web trong namespace default"

image=$(jq -r '.spec.containers[0].image' <<<"$pod")
if [ "$image" = "nginx:1.27-alpine" ]; then
  pass "Pod web chạy image nginx:1.27-alpine"
else
  fail "Pod web chạy image nginx:1.27-alpine (hiện: $image; xoá Pod rồi tạo lại đúng image)"
fi

ready=$(jq -r '.status.conditions[]? | select(.type == "Ready") | .status' <<<"$pod")
if [ "$ready" = "True" ]; then
  pass "Pod web đã Ready"
else
  phase=$(jq -r '.status.phase' <<<"$pod")
  fail "Pod web đã Ready (hiện: $phase; chờ bằng kubectl wait --for=condition=Ready pod/web)"
fi

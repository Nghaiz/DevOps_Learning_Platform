#!/bin/bash
# Bước 6: namespace lab có Pod web (nginx:1.27-alpine) đang Ready.
set -uo pipefail
export KUBECONFIG=/var/lib/dlp/k3s/kubeconfig.yaml
k() { kubectl --request-timeout=10s "$@"; }

if ! k get --raw /readyz >/dev/null 2>&1; then
  fail "Cụm Kubernetes trong sandbox đang trả lời (chưa: đợi vài giây rồi kiểm lại)"
  exit 1
fi

if [ -z "$(k get namespace lab --ignore-not-found -o name 2>/dev/null)" ]; then
  fail "Có namespace lab (chưa có: kubectl create namespace lab)"
  exit 1
fi
pass "Có namespace lab"

pod=$(k get pod web -n lab -o json 2>/dev/null)
if [ -z "$pod" ]; then
  fail "Có Pod web trong namespace lab (chưa có: kubectl apply -f web-pod.yaml -n lab)"
  exit 1
fi

image=$(jq -r '.spec.containers[0].image' <<<"$pod")
ready=$(jq -r '.status.conditions[]? | select(.type == "Ready") | .status' <<<"$pod")
if [ "$image" = "nginx:1.27-alpine" ] && [ "$ready" = "True" ]; then
  pass "Pod lab/web chạy nginx:1.27-alpine và đã Ready"
else
  fail "Pod lab/web chạy nginx:1.27-alpine và đã Ready (hiện: image $image, Ready=$ready)"
fi

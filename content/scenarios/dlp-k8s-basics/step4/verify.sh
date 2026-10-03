#!/bin/bash
# Bước 4: Pod default/web đã bị xoá.
# `--ignore-not-found` để tách "không có Pod" (đạt) khỏi "API lỗi" (không được
# đọc thành đạt): khi API lỗi, kubectl thoát khác 0 và ta báo trượt.
set -uo pipefail
export KUBECONFIG=/var/lib/dlp/k3s/kubeconfig.yaml
k() { kubectl --request-timeout=10s "$@"; }

if ! k get --raw /readyz >/dev/null 2>&1; then
  fail "Cụm Kubernetes trong sandbox đang trả lời (chưa: đợi vài giây rồi kiểm lại)"
  exit 1
fi

if ! found=$(k get pod web -n default --ignore-not-found -o name 2>/dev/null); then
  fail "Đọc được danh sách Pod trong namespace default (API vừa lỗi: kiểm lại)"
  exit 1
fi
if [ -z "$found" ]; then
  pass "Pod web không còn trong namespace default"
else
  fail "Pod web không còn trong namespace default (vẫn còn: kubectl delete pod web)"
fi

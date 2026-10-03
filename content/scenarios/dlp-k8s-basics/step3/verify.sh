#!/bin/bash
# Bước 3: trang chủ nginx trong Pod web đã được thay bằng "xin chào từ web".
# Kiểm bằng một request HTTP thật trong Pod, không đọc file: đề nói về thứ nginx
# trả ra, và một file đúng nội dung ở sai thư mục vẫn phải trượt.
set -uo pipefail
export KUBECONFIG=/var/lib/dlp/k3s/kubeconfig.yaml
k() { kubectl --request-timeout=10s "$@"; }

if ! k get --raw /readyz >/dev/null 2>&1; then
  fail "Cụm Kubernetes trong sandbox đang trả lời (chưa: đợi vài giây rồi kiểm lại)"
  exit 1
fi

if [ -z "$(k get pod web -n default --ignore-not-found -o name 2>/dev/null)" ]; then
  fail "Pod web trong namespace default đang chạy (không thấy: quay lại bước 2)"
  exit 1
fi

body=$(k exec -n default web -- wget -qO- -T 3 http://localhost 2>/dev/null)
if grep -q 'xin chào từ web' <<<"$body"; then
  pass "nginx trong Pod web trả về trang 'xin chào từ web'"
else
  shown=$(head -c 60 <<<"$body" | tr '\n' ' ')
  fail "nginx trong Pod web trả về trang 'xin chào từ web' (hiện: ${shown:-không có phản hồi}; chạy lại lệnh echo của bước này)"
fi

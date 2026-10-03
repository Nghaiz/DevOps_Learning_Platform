#!/bin/bash
# `dong-ho` chỉ ghi marker trong trap SIGINT, nên marker có mặt nghĩa là người
# học đã thật sự chạy nó rồi bấm Ctrl+C (không phải chỉ đọc bài).
set -uo pipefail

if [ -s /var/lib/dlp-lesson/ctrl-c ]; then
  pass "dong-ho đã nhận Ctrl+C lúc $(cat /var/lib/dlp-lesson/ctrl-c)"
else
  fail "dong-ho chưa nhận Ctrl+C nào: gõ dong-ho, chờ vài giây, rồi bấm Ctrl+C"
fi

# Không còn bản dong-ho nào treo lại (vd. ai đó chạy nó nền bằng &).
if pgrep -f /usr/local/bin/dong-ho >/dev/null 2>&1; then
  fail "Vẫn còn một dong-ho đang chạy"
else
  pass "Không còn dong-ho nào đang chạy"
fi

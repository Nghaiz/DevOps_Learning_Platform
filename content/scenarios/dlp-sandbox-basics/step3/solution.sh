#!/bin/bash
# Thay cho "gõ dong-ho rồi bấm Ctrl+C": chạy nó 3 giây rồi gửi đúng SIGINT.
# `timeout` giữ dong-ho ở tiền cảnh (không phải job nền), nên SIGINT không bị
# bỏ qua và trap của nó chạy như khi người học bấm phím.
set -uo pipefail
timeout --preserve-status -s INT 3 dong-ho
rc=$?
# 130 = dong-ho thoát qua trap SIGINT; mọi mã khác là lời giải hỏng.
[ "$rc" -eq 130 ] || { echo "dong-ho thoát $rc, mong đợi 130" >&2; exit 1; }

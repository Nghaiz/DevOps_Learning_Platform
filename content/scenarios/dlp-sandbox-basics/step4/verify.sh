#!/bin/bash
# Đạt khi ~/ghi-chu/ngay-dau.txt có đúng một dòng "xin chào từ <hostname>".
#
# Phần giữa ("chào từ") so lỏng có chủ ý: người gõ tay bằng bộ gõ tiếng Việt có
# thể sinh dấu tổ hợp (NFD) thay vì ký tự dựng sẵn, và bash không chuẩn hoá
# Unicode được. Đầu dòng và tên máy thì so chặt.
set -uo pipefail

f=/root/ghi-chu/ngay-dau.txt
host=$(hostname)

if [ ! -f "$f" ]; then
  fail "Chưa có tệp $f (chạy mkdir -p ~/ghi-chu rồi lệnh echo của bước này)"
  exit 1
fi
pass "Có tệp $f"

lines=$(wc -l < "$f")
if [ "$lines" -eq 1 ]; then
  pass "Tệp có đúng một dòng"
else
  fail "Tệp có đúng một dòng (hiện: $lines dòng)"
fi

line=$(head -n 1 "$f")
if [[ "$line" == "xin ch"* && "$line" == *" $host" ]]; then
  pass "Dòng đó là \"xin chào từ $host\""
else
  fail "Dòng đó là \"xin chào từ $host\" (hiện: \"$line\")"
fi

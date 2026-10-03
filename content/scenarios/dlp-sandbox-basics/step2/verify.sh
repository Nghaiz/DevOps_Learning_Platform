#!/bin/bash
# Đạt khi người học đã tạo da-doc.txt trong thư mục báo cáo (gõ tay bằng Tab).
set -uo pipefail

dir=/root/kho/bao-cao-van-hanh-thang-09-ban-chot
if [ -f "$dir/da-doc.txt" ]; then
  pass "Có tệp da-doc.txt trong $dir"
else
  fail "Chưa có $dir/da-doc.txt (gọi lại lệnh cat bằng mũi tên lên, đổi thành touch … da-doc.txt)"
fi

# Ghi chú bàn giao phải còn nguyên: bước này dạy đọc rồi đánh dấu, không dạy xoá.
check "Ghi chú doc-truoc.txt vẫn còn" test -s "$dir/doc-truoc.txt"

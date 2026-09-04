#!/bin/bash
# `stat -c '%a'` đọc quyền dạng bát phân — so chuỗi trực tiếp với "600" là đủ,
# không cần tách bit vì 600 là giá trị DUY NHẤT được coi là đạt (không chấp
# nhận 400/440/640: bài dạy đúng MỘT quyền đích, không phải "quyền hẹp hơn 644").
set -uo pipefail

f=/root/lab-linux/service.secret

if [ ! -f "$f" ]; then
  echo "Khong tim thay $f."
  exit 1
fi

perm=$(stat -c '%a' "$f" 2>/dev/null)
if [ "$perm" != "600" ]; then
  echo "Quyen hien tai cua $f la '${perm:-khong doc duoc}', can dung 600."
  echo "Hay chay: chmod 600 $f"
  exit 1
fi

echo "Dat — $f da co quyen 600."

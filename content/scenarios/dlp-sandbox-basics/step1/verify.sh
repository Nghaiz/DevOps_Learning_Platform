#!/bin/bash
# Hai giá trị THẬT: trượt khi chưa có tệp, đạt khi nội dung đúng.
set -uo pipefail

target=/root/lab/hello.txt

if [ ! -f "$target" ]; then
  echo "Chua thay $target. Hay chay: echo dlp > $target"
  exit 1
fi

content=$(tr -d '\r\n' < "$target")
if [ "$content" != "dlp" ]; then
  echo "Noi dung phai dung la 'dlp', dang la '$content'"
  exit 1
fi

echo "Dat — $target da co noi dung dung."

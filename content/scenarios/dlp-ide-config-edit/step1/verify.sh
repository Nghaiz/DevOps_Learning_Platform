#!/bin/bash
# Hai giá trị THẬT: trượt khi còn `port=0`, đạt khi đã là `port=8080`.
#
# ⚠ Phép kiểm này KHÔNG phân biệt được sửa bằng editor với sửa bằng `sed` — nó
# chỉ đọc file. Nói thẳng điều đó trong step1.md thay vì để nhãn khẳng định
# nhiều hơn thứ ta đo được.
set -uo pipefail

target=/root/lab/app.conf

if [ ! -f "$target" ]; then
  echo "Khong thay $target. File nay do buoc chuan bi gieo san — neu no bien mat, hay ket thuc phien roi bat dau lai."
  exit 1
fi

port=$(grep -E '^port=' "$target" | head -1 | cut -d= -f2 | tr -d '[:space:]')

if [ -z "$port" ]; then
  echo "Khong con dong 'port=' nao trong $target. Hay them lai: port=8080"
  exit 1
fi

if [ "$port" != "8080" ]; then
  echo "port dang la '$port', can dung la 8080."
  exit 1
fi

# Hai dong con lai phai con nguyen — de bat truong hop ghi de ca file.
if ! grep -qE '^name=dlp-demo$' "$target" || ! grep -qE '^log_level=info$' "$target"; then
  echo "port da dung nhung hai dong con lai (name, log_level) da mat. Hay giu nguyen phan con lai cua file."
  exit 1
fi

echo "Dat — port=8080, phan con lai cua file van nguyen."

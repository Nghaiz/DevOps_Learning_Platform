#!/bin/bash
# Đạt khi image TỒN TẠI và CHẠY ĐƯỢC, không chỉ khi nó tồn tại.
#
# `docker image inspect` một mình là chưa đủ: một Dockerfile thiếu `CMD`, hoặc
# COPY nhầm tên tệp, vẫn cho ra image hợp lệ — nó chỉ hỏng lúc chạy. Bài này dạy
# "dựng được thứ chạy được", nên phép chấm phải chạy nó.
#
# `docker run` ở đây rẻ: image nằm sẵn trên máy, không chạm mạng, thoát sau chưa
# tới một giây. Trần một lượt chấm là 30s (GATEWAY_EXEC_TIMEOUT) nên vẫn dư.
set -uo pipefail

if ! docker info > /dev/null 2>&1; then
  echo "Docker daemon chua san sang. Doi vai giay roi thu lai."
  exit 1
fi

if ! docker image inspect myapp:1 > /dev/null 2>&1; then
  echo "Chua thay image myapp:1."
  echo "Hay chay: cd /root/lab-docker && docker build -t myapp:1 ."
  exit 1
fi

out=$(timeout 20 docker run --rm myapp:1 2>&1)
rc=$?
if [ $rc -ne 0 ]; then
  echo "Image myapp:1 co ton tai nhung chay THAT BAI (exit=$rc):"
  echo "$out" | head -5
  exit 1
fi

if ! printf '%s' "$out" | grep -q 'DLP docker lab'; then
  echo "myapp:1 chay duoc nhung khong in ra dong mong doi tu app.py. Nhan duoc:"
  echo "$out" | head -5
  echo "Kiem tra lai dong COPY app.py . va CMD trong Dockerfile."
  exit 1
fi

echo "Dat — myapp:1 da duoc dung va chay ra dung ket qua."

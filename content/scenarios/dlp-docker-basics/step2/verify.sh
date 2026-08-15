#!/bin/bash
# Hai vế phải cùng đúng: container CHẠY, và cổng THẬT SỰ thông.
#
# Kiểm cả hai vì chúng hỏng độc lập: quên `-p` thì container vẫn `Up` mà không ai
# gọi được; container chết ngay sau khi start thì `-p` đúng vẫn vô nghĩa. Một
# phép kiểm chỉ nhìn `docker ps` sẽ cho "đạt" ở ca thứ nhất — tức nó mù đúng cái
# lỗi mà người học hay mắc nhất ở bước này.
set -uo pipefail

if ! docker info > /dev/null 2>&1; then
  echo "Docker daemon chua san sang. Doi vai giay roi thu lai."
  exit 1
fi

state=$(docker inspect -f '{{.State.Running}}' web 2>/dev/null)
if [ "$state" != "true" ]; then
  echo "Chua thay container ten 'web' dang chay."
  echo "Hay chay: docker run -d --name web -p 8080:80 nginx:alpine"
  exit 1
fi

code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://localhost:8080/ 2>/dev/null)
if [ "$code" != "200" ]; then
  echo "Container 'web' dang chay nhung cong 8080 khong tra loi (nhan duoc: '${code:-khong co}')."
  echo "Kiem tra lai phan '-p 8080:80' trong lenh docker run."
  exit 1
fi

echo "Dat — container 'web' dang chay va cong 8080 tra ve 200."

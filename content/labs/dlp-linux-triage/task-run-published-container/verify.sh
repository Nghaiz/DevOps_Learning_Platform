#!/bin/bash
# Hai vế phải cùng đúng: container CHẠY, và cổng THẬT SỰ thông — cùng khuôn
# task2 của dlp-docker-basics (`docker inspect` rồi mới `curl`), một grader
# chỉ nhìn `docker ps` sẽ mù đúng lỗi hay gặp nhất ("quên -p").
set -uo pipefail

if ! docker info > /dev/null 2>&1; then
  echo "Docker daemon chua san sang. Doi vai giay roi thu lai."
  exit 1
fi

state=$(docker inspect -f '{{.State.Running}}' lab-web 2>/dev/null)
if [ "$state" != "true" ]; then
  echo "Chua thay container ten 'lab-web' dang chay."
  echo "Hay chay: docker run -d --name lab-web -p 8090:80 nginx:alpine"
  exit 1
fi

code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://localhost:8090/ 2>/dev/null)
if [ "$code" != "200" ]; then
  echo "Container 'lab-web' dang chay nhung cong 8090 khong tra loi (nhan duoc: '${code:-khong co}')."
  echo "Kiem tra lai phan '-p 8090:80' trong lenh docker run."
  exit 1
fi

echo "Dat — container 'lab-web' dang chay va cong 8090 tra ve 200."

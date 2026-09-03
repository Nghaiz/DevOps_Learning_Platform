#!/bin/bash
# Tải công việc = đúng thứ bài dlp-docker-basics bắt người học làm:
# kéo image qua mirror, chạy container map cổng, rồi BUILD một image riêng.
# Đây là phần nặng nhất của bài (bước 4), và là thứ 163Mi của P3 đo được.
exec >/tmp/6e-lesson.log 2>&1
set -x
for i in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done
docker pull nginx:alpine
docker run -d --name web -p 8080:80 nginx:alpine
mkdir -p /root/lab/app && cd /root/lab/app
printf "FROM nginx:alpine\nRUN echo hello-6e > /usr/share/nginx/html/index.html\n" > Dockerfile
docker build -t dlp-6e:latest .
docker run --rm dlp-6e:latest cat /usr/share/nginx/html/index.html
docker ps
echo XONG

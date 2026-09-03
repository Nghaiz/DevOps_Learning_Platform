#!/bin/bash
# Chạy TRONG terminal người học đang nhìn — đợi background.sh dựng xong trước
# khi hiện "sẵn sàng", cùng khuôn với dlp-docker-basics/intro/foreground.sh.
echo "Dang chuan bi moi truong lab..."
while [ ! -f /root/lab-linux/.setup-done ]; do sleep 1; done
echo "San sang. Thu muc lam viec: /root/lab-linux"

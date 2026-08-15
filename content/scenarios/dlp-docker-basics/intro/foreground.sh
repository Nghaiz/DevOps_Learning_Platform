#!/bin/bash
# Chạy TRONG terminal người học đang nhìn — đó là toàn bộ khác biệt với
# background.sh. Nó phải nói cho người ta biết chuyện gì đang xảy ra.
echo "Dang chuan bi moi truong lab..."
while [ ! -f /root/lab-docker/.setup-done ]; do sleep 1; done
echo "San sang. Thu muc lam viec: /root/lab-docker"

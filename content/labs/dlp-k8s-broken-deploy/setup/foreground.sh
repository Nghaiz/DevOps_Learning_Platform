#!/bin/bash
# Chạy TRONG terminal người học đang nhìn — cùng khuôn
# dlp-linux-triage/setup/foreground.sh, nhưng chờ đúng cờ của lab này.
echo "Dang dung 5 Deployment/Service hong trong cum Kubernetes con..."
while [ ! -f /root/lab-k8s/.setup-done ]; do sleep 1; done
echo "San sang. 5 task doc lap voi nhau — lam theo thu tu tuy y."

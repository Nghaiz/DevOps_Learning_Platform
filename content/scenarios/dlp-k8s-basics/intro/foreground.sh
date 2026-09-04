#!/bin/bash
# Chạy TRONG terminal người học đang nhìn, cùng vai trò
# dlp-docker-basics/intro/foreground.sh — nhưng ở đây "chờ xong" nghĩa là chờ
# CỤM KUBERNETES CON Ready, không phải chờ một cờ file do background.sh tạo.
# `dlp-k8s-wait` (images/sandbox-base/dlp-k8s-wait.sh) đã tự làm việc đó và tự
# copy kubeconfig ra chỗ `kubectl` tìm mặc định.
echo "Dang cho cum Kubernetes con san sang (thuong duoi mot phut)..."
dlp-k8s-wait
rc=$?
if [ "$rc" -eq 0 ]; then
  echo "San sang. kubectl da duoc cau hinh san, tro thang vao cum nay."
elif [ "$rc" -eq 2 ]; then
  # Loi cau hinh phien (DLP_K8S != 1) — khong phai loi cua nguoi hoc. Ghi ro de
  # ho khong tu trach minh khi kubectl bao "connection refused" sau do.
  echo "Phien nay khong duoc bat cum Kubernetes con (loi cau hinh ha tang)." >&2
  echo "Bao lai cho quan tri vien — day khong phai loi cua ban." >&2
else
  echo "Cum chua san sang sau thoi gian cho mac dinh. Go 'dlp-k8s-wait' trong terminal de cho them." >&2
fi

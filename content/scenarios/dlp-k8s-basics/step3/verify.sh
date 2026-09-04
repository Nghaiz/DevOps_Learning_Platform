#!/bin/bash
# Hai gia tri THAT: truot khi Deployment 'web' chua ton tai hoac chua du ban
# sao Ready, dat khi da du va dung image. KHONG doi hoi 'solo-pod' phai bi
# xoa — mot verify chi doc TRANG THAI CUOI se khong the phan biet "chua bao
# gio tao solo-pod" voi "da xoa solo-pod dung nhu bai day", nen day khong
# phai dieu kien duoc cham; no chi la huong dan trong markdown.
set -uo pipefail

dlp-k8s-wait 15
rc=$?
if [ "$rc" -ne 0 ]; then
  if [ "$rc" -eq 2 ]; then
    echo "Phien nay khong bat cum Kubernetes con (loi cau hinh ha tang, khong phai loi lam bai)."
    echo "Bao lai cho quan tri vien."
  else
    echo "Cum chua san sang sau vai giay cho them. Doi mot chut roi bam Kiem tra lai."
  fi
  exit 1
fi

if ! kubectl get deployment web >/dev/null 2>&1; then
  echo "Chua thay Deployment 'web'. Hay chay: kubectl create deployment web --image=nginx:1.29.0"
  exit 1
fi

DESIRED=$(kubectl get deployment web -o jsonpath='{.spec.replicas}' 2>/dev/null)
READY=$(kubectl get deployment web -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
IMAGE=$(kubectl get deployment web -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null)
DESIRED=${DESIRED:-0}
READY=${READY:-0}

if [ "$READY" -lt 1 ] || [ "$READY" -lt "$DESIRED" ]; then
  echo "Deployment 'web' chua san sang du so ban sao (ready=$READY desired=$DESIRED)."
  echo "Chay: kubectl rollout status deployment/web --timeout=60s"
  exit 1
fi

if [ "$IMAGE" != "nginx:1.29.0" ]; then
  echo "Deployment 'web' dang dung image '$IMAGE', can dung nginx:1.29.0."
  exit 1
fi

echo "Dat — Deployment 'web' san sang $READY/$DESIRED ban sao voi image nginx:1.29.0."

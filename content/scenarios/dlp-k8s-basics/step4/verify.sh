#!/bin/bash
# Hai gia tri THAT: truot khi ConfigMap thieu/sai NOI DUNG, hoac gia tri chua
# thuc su toi duoc bien moi truong TRONG container; dat khi ca hai deu dung.
#
# `printenv` (coreutils) — khong phai `bash -c` hay `curl` — vi image
# nginx:1.29.0 (Debian) chac chan co no; da kiem that: `docker run --rm
# nginx:1.29.0 which printenv` -> /usr/bin/printenv.
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

if ! kubectl get configmap web-config >/dev/null 2>&1; then
  echo "Chua thay ConfigMap 'web-config'."
  echo 'Hay chay: kubectl create configmap web-config --from-literal=GREETING="Xin chao tu ConfigMap"'
  exit 1
fi

CM_VALUE=$(kubectl get configmap web-config -o jsonpath='{.data.GREETING}' 2>/dev/null)
if [ "$CM_VALUE" != "Xin chao tu ConfigMap" ]; then
  echo "ConfigMap 'web-config' co ton tai nhung key GREETING khong dung noi dung mong doi."
  echo "Nhan duoc: '${CM_VALUE:-rong}'"
  exit 1
fi

if ! kubectl get deployment web >/dev/null 2>&1; then
  echo "Chua thay Deployment 'web'. Hoan thanh step truoc (Deployment) roi quay lai day."
  exit 1
fi

READY=$(kubectl get deployment web -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
READY=${READY:-0}
if [ "$READY" -lt 1 ]; then
  echo "Deployment 'web' chua co ban sao nao san sang. Doi vai giay roi Kiem tra lai."
  exit 1
fi

POD=$(kubectl get pod -l app=web --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -z "$POD" ]; then
  echo "Khong tim thay Pod dang Running cua Deployment 'web'."
  exit 1
fi

POD_ENV=$(kubectl exec "$POD" -- printenv GREETING 2>/dev/null)
if [ "$POD_ENV" != "Xin chao tu ConfigMap" ]; then
  echo "Pod '$POD' chua thay bien moi truong GREETING dung noi dung."
  echo "Hay chay: kubectl set env deployment/web --from=configmap/web-config"
  echo "roi: kubectl rollout status deployment/web --timeout=60s"
  exit 1
fi

echo "Dat — ConfigMap 'web-config' da gan dung vao Deployment 'web' (GREETING='$POD_ENV')."

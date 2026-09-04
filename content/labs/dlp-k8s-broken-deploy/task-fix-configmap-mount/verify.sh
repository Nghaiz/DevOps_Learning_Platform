#!/bin/bash
# Hai gia tri THAT: truot khi ConfigMap 'missing-html-config' chua ton tai
# hoac Pod cua 'broken-configmap' chua Ready, dat khi ca hai deu dung.
set -uo pipefail

dlp-k8s-wait 15
rc=$?
if [ "$rc" -ne 0 ]; then
  if [ "$rc" -eq 2 ]; then
    echo "Phien nay khong bat cum Kubernetes con (loi cau hinh ha tang, khong phai loi lam bai)."
    echo "Bao lai cho quan tri vien."
  else
    echo "Cum chua san sang sau vai giay cho them. Doi mot chut roi Cham lai."
  fi
  exit 1
fi

if ! kubectl get configmap missing-html-config >/dev/null 2>&1; then
  echo "Chua thay ConfigMap 'missing-html-config'."
  echo "Hay chay: kubectl create configmap missing-html-config --from-literal=index.html='<h1>...</h1>'"
  exit 1
fi

if ! kubectl get deployment broken-configmap >/dev/null 2>&1; then
  echo "Khong thay Deployment 'broken-configmap' — moi truong lab chua dung xong hoac da bi xoa nham."
  exit 1
fi

READY=$(kubectl get deployment broken-configmap -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
READY=${READY:-0}
if [ "$READY" -lt 1 ]; then
  echo "ConfigMap da co nhung Pod cua 'broken-configmap' chua Ready (readyReplicas=$READY)."
  echo "Hay chay: kubectl rollout restart deployment/broken-configmap"
  exit 1
fi

echo "Dat — ConfigMap 'missing-html-config' da co va Deployment 'broken-configmap' da Ready."

#!/bin/bash
# Hai gia tri THAT: truot khi image con sai (chua sua, hoac sua ma chua len
# Ready), dat khi dung image nginx:1.29.0 va da co ban sao Ready.
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

if ! kubectl get deployment broken-image >/dev/null 2>&1; then
  echo "Khong thay Deployment 'broken-image' — moi truong lab chua dung xong hoac da bi xoa nham."
  exit 1
fi

IMAGE=$(kubectl get deployment broken-image -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null)
if [ "$IMAGE" != "nginx:1.29.0" ]; then
  echo "Deployment 'broken-image' van dung image '${IMAGE:-trong}'."
  echo "Hay chay: kubectl set image deployment/broken-image web=nginx:1.29.0"
  exit 1
fi

READY=$(kubectl get deployment broken-image -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
READY=${READY:-0}
if [ "$READY" -lt 1 ]; then
  echo "Image da sua dung nhung Pod chua Ready (readyReplicas=$READY). Doi vai giay roi Cham lai."
  exit 1
fi

echo "Dat — Deployment 'broken-image' dung nginx:1.29.0 va $READY ban sao da Ready."

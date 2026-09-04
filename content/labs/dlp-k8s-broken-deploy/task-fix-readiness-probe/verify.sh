#!/bin/bash
# Hai gia tri THAT: truot khi Deployment 'broken-probe' chua co ban sao Ready
# (probe con tro sai duong dan), dat khi da co.
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

if ! kubectl get deployment broken-probe >/dev/null 2>&1; then
  echo "Khong thay Deployment 'broken-probe' — moi truong lab chua dung xong hoac da bi xoa nham."
  exit 1
fi

READY=$(kubectl get deployment broken-probe -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
READY=${READY:-0}
if [ "$READY" -lt 1 ]; then
  echo "Pod cua 'broken-probe' van chua Ready (readyReplicas=$READY)."
  echo "Kiem tra readinessProbe.httpGet.path bang:"
  echo "  kubectl get deployment broken-probe -o jsonpath='{.spec.template.spec.containers[0].readinessProbe}'"
  exit 1
fi

echo "Dat — Deployment 'broken-probe' co $READY ban sao Ready."

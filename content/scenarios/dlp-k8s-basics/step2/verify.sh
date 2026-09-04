#!/bin/bash
# Hai gia tri THAT: truot khi Pod 'solo-pod' chua ton tai hoac chua
# Running/Ready, dat khi no da Running/Ready voi dung image.
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

if ! kubectl get pod solo-pod >/dev/null 2>&1; then
  echo "Chua thay Pod 'solo-pod'. Hay chay: kubectl run solo-pod --image=nginx:1.29.0 --port=80"
  exit 1
fi

PHASE=$(kubectl get pod solo-pod -o jsonpath='{.status.phase}' 2>/dev/null)
READY=$(kubectl get pod solo-pod -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null)
IMAGE=$(kubectl get pod solo-pod -o jsonpath='{.spec.containers[0].image}' 2>/dev/null)

if [ "$PHASE" != "Running" ] || [ "$READY" != "true" ]; then
  echo "Pod 'solo-pod' ton tai nhung chua Running/Ready (phase='${PHASE:-trong}' ready='${READY:-trong}')."
  echo "Doi vai giay roi Kiem tra lai."
  exit 1
fi

if [ "$IMAGE" != "nginx:1.29.0" ]; then
  echo "Pod 'solo-pod' dang chay image '$IMAGE', can dung nginx:1.29.0."
  exit 1
fi

echo "Dat — Pod 'solo-pod' Running/Ready voi image nginx:1.29.0."

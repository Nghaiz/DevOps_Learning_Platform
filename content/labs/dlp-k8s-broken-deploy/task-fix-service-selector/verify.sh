#!/bin/bash
# Hai gia tri THAT: truot khi Endpoints cua 'broken-selector-svc' con rong,
# dat khi no da co it nhat mot dia chi.
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

if ! kubectl get service broken-selector-svc >/dev/null 2>&1; then
  echo "Khong thay Service 'broken-selector-svc' — moi truong lab chua dung xong hoac da bi xoa nham."
  exit 1
fi

EP_COUNT=$(kubectl get endpoints broken-selector-svc -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null | wc -w | tr -d ' ')
if [ "${EP_COUNT:-0}" -lt 1 ]; then
  echo "Service 'broken-selector-svc' van chua co Endpoints nao."
  echo "So sanh 'kubectl get pods -l app=broken-selector --show-labels' voi"
  echo "'kubectl get service broken-selector-svc -o jsonpath={.spec.selector}' roi sua selector cho khop."
  exit 1
fi

echo "Dat — Service 'broken-selector-svc' co $EP_COUNT dia chi Pod dang duoc chon."

#!/bin/bash
# Hai gia tri THAT: truot khi Service 'web-svc' chua ton tai hoac Endpoints
# rong, dat khi ca hai deu dung.
#
# Dung `Endpoints` — khong phai mot lan exec+curl — lam bang chung CHINH:
# Endpoints la object Kubernetes tu ghi lai ket qua noi selector<->label, nen
# no la cach kiem KHACH QUAN NHAT rang Service da tim dung Pod, doc lap voi
# viec container co cong cu HTTP nao ben trong hay khong.
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

if ! kubectl get service web-svc >/dev/null 2>&1; then
  echo "Chua thay Service 'web-svc'."
  echo "Hay chay: kubectl expose deployment/web --name=web-svc --port=80 --target-port=80"
  exit 1
fi

SVC_PORT=$(kubectl get service web-svc -o jsonpath='{.spec.ports[0].port}' 2>/dev/null)
if [ "$SVC_PORT" != "80" ]; then
  echo "Service 'web-svc' ton tai nhung cong la '${SVC_PORT:-trong}', can la 80."
  exit 1
fi

EP_COUNT=$(kubectl get endpoints web-svc -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null | wc -w | tr -d ' ')
if [ "${EP_COUNT:-0}" -lt 1 ]; then
  echo "Service 'web-svc' chua co Endpoints nao (khong Pod nao dang duoc chon)."
  echo "Kiem tra lai selector cua Service co khop label cua Deployment 'web' khong,"
  echo "va Pod da Ready chua: kubectl get pod -l app=web"
  exit 1
fi

echo "Dat — Service 'web-svc:80' co $EP_COUNT dia chi Pod dang duoc chon (Endpoints khong rong)."

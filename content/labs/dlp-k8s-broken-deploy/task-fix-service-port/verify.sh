#!/bin/bash
# Kiem tra CHUC NANG that: khong chi 'targetPort == 80' o cau hinh, ma mot
# ket noi TCP that qua Service phai tra ve phan hoi HTTP. Endpoints o bai nay
# KHONG rong ngay tu dau (khac task fix-service-selector) nen no khong phai
# la phep kiem phan biet duoc o day — chi mot lan goi that qua cong moi
# phan biet duoc "targetPort dung" voi "targetPort sai".
#
# `bash` + `/dev/tcp/HOST/PORT` — da kiem THAT bang docker cuc bo (khong phai
# suy doan): `docker run --rm nginx:1.29.0 bash -c '...'` xac nhan image
# nginx:1.29.0 (Debian) co bash, va mot container nginx that tra ve dung
# "HTTP/1.1 200 OK" qua chinh ky thuat nay.
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

if ! kubectl get service broken-port-svc >/dev/null 2>&1; then
  echo "Khong thay Service 'broken-port-svc' — moi truong lab chua dung xong hoac da bi xoa nham."
  exit 1
fi

POD=$(kubectl get pod -l app=broken-port --field-selector=status.phase=Running -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -z "$POD" ]; then
  echo "Khong tim thay Pod dang Running cua Deployment 'broken-port'."
  exit 1
fi

RESPONSE=$(kubectl exec "$POD" -- bash -c 'exec 3<>/dev/tcp/broken-port-svc/80 && printf "GET / HTTP/1.0\r\n\r\n" >&3 && timeout 2 head -c 40 <&3' 2>/dev/null)
if ! printf '%s' "$RESPONSE" | grep -q 'HTTP/1.1 200'; then
  echo "Ket noi qua Service 'broken-port-svc' KHONG nhan duoc phan hoi HTTP 200."
  echo "Kiem tra lai targetPort: kubectl get service broken-port-svc -o jsonpath='{.spec.ports}'"
  echo "nginx trong Pod dang lang nghe cong 80 — targetPort phai la 80."
  exit 1
fi

echo "Dat — goi qua Service 'broken-port-svc' nhan duoc HTTP 200 tu Pod '$POD'."

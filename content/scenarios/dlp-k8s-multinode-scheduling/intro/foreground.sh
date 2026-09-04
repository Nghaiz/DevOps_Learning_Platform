#!/bin/bash
# Cho CA HAI node Ready, khong phai node dau tien. `dlp-k8s-wait` doc
# DLP_K8S_NODES (profile k8s-multinode dat =2) nen phep cho o day va phep dung
# o entrypoint khong the lech nhau - cung mot bien, hai phia.
echo "Dang cho cum Kubernetes HAI node san sang (thuong khoang mot phut)..."
dlp-k8s-wait
rc=$?
if [ "$rc" -eq 0 ]; then
  echo "San sang. kubectl da duoc cau hinh san, tro thang vao cum nay."
elif [ "$rc" -eq 2 ]; then
  echo "Phien nay khong duoc bat cum Kubernetes con (loi cau hinh ha tang)." >&2
  echo "Bao lai cho quan tri vien - day khong phai loi cua ban." >&2
else
  echo "Cum chua du hai node san sang. Go 'dlp-k8s-wait' trong terminal de cho them." >&2
fi

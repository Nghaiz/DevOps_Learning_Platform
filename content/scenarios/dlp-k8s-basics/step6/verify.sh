#!/bin/bash
# Hai gia tri THAT: truot khi node chua mang nhan 'dlp-lab=k8s-basics', dat
# khi da mang dung gia tri.
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

LABEL_VALUE=$(kubectl get nodes -o jsonpath='{.items[0].metadata.labels.dlp-lab}' 2>/dev/null)
if [ "$LABEL_VALUE" != "k8s-basics" ]; then
  echo "Node chua co nhan 'dlp-lab=k8s-basics'."
  echo 'Hay chay: NODE=$(kubectl get nodes -o jsonpath="{.items[0].metadata.name}") && kubectl label node "$NODE" dlp-lab=k8s-basics --overwrite'
  exit 1
fi

# Canh bao mem — khong lam script that bai, vi day khong phai dieu nguoi hoc
# kiem soat. No la mot doi chung: neu gia dinh mot-node bi pha vo, ai do can
# biet, nhung khong nen chan nguoi hoc vi mot thu ho khong lam sai.
NODE_COUNT=$(kubectl get nodes --no-headers 2>/dev/null | wc -l | tr -d ' ')
if [ "${NODE_COUNT:-1}" -ne 1 ]; then
  echo "CANH BAO: cum bao cao $NODE_COUNT node — khac gia dinh mot-node cua bai nay. Bao cho quan tri vien."
fi

echo "Dat — node da mang nhan dlp-lab=k8s-basics."

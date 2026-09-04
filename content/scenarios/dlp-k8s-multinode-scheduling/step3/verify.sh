#!/bin/bash
# Hai gia tri THAT: truot khi DaemonSet chua ton tai / chua du 2 ban sao Ready /
# hai Pod roi vao cung mot node; dat khi desired=ready=2 tren hai node phan biet.
#
# Dem NODE PHAN BIET chu khong chi doc `numberReady`: chinh phep dem do la thu
# phan biet "moi node mot ban sao" voi "hai ban sao tinh co cung cho" - va tren
# mot cum mot node thi ve nay la ve duy nhat do.
set -uo pipefail

dlp-k8s-wait 15
rc=$?
if [ "$rc" -ne 0 ]; then
  if [ "$rc" -eq 2 ]; then
    echo "Phien nay khong bat cum Kubernetes con (loi cau hinh ha tang, khong phai loi lam bai)."
  else
    echo "Cum chua du hai node san sang. Doi mot chut roi bam Kiem tra lai."
  fi
  exit 1
fi

if ! kubectl get daemonset probe >/dev/null 2>&1; then
  echo "Chua thay DaemonSet 'probe'. Xem lai buoc tao ds.yaml trong huong dan."
  exit 1
fi

DESIRED=$(kubectl get daemonset probe -o jsonpath='{.status.desiredNumberScheduled}' 2>/dev/null)
READY=$(kubectl get daemonset probe -o jsonpath='{.status.numberReady}' 2>/dev/null)
DESIRED=${DESIRED:-0}
READY=${READY:-0}

if [ "$DESIRED" -lt 2 ]; then
  echo "DaemonSet 'probe' chi muon $DESIRED ban sao - tren cum hai node con so nay phai la 2."
  echo "Thuong la thieu 'tolerations: [{operator: Exists}]' nen node control-plane bi bo qua."
  exit 1
fi

if [ "$READY" -lt "$DESIRED" ]; then
  echo "DaemonSet 'probe' moi san sang $READY/$DESIRED ban sao."
  echo "Chay: kubectl get pods -l app=probe -o wide - cot STATUS se noi ro."
  exit 1
fi

NODES=$(kubectl get pods -l app=probe -o jsonpath='{range .items[*]}{.spec.nodeName}{"\n"}{end}' 2>/dev/null | sort -u | grep -c .)
NODES=${NODES:-0}
if [ "$NODES" -lt 2 ]; then
  echo "Ca $READY Pod cua DaemonSet dang nam tren $NODES node - can 2 node phan biet."
  exit 1
fi

echo "Dat - DaemonSet 'probe' $READY/$DESIRED ban sao, trai tren $NODES node phan biet."

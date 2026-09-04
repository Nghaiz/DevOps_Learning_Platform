#!/bin/bash
# Hai gia tri THAT: truot khi Pod chua ton tai / chua Running / nam sai node,
# dat khi Running dung tren node mang nhan VA node do khong phai control-plane.
#
# Ve "khong phai control-plane" la ve quan trong: neu nguoi hoc gan nhan len
# CHINH node control-plane thi nodeSelector van "hoat dong" va bai van xanh tren
# mot cum mot node - dung cai chuyen ma bai nay ton tai de ngan.
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

if ! kubectl get pod pinned >/dev/null 2>&1; then
  echo "Chua thay Pod 'pinned'. Xem lai buoc 3 trong huong dan."
  exit 1
fi

PHASE=$(kubectl get pod pinned -o jsonpath='{.status.phase}' 2>/dev/null)
NODE=$(kubectl get pod pinned -o jsonpath='{.spec.nodeName}' 2>/dev/null)
PHASE=${PHASE:-unknown}

if [ "$PHASE" != "Running" ]; then
  echo "Pod 'pinned' dang o trang thai '$PHASE', chua Running."
  echo "Chay: kubectl describe pod pinned - dong Events se noi ro vi sao."
  exit 1
fi

if [ -z "$NODE" ]; then
  echo "Pod 'pinned' chua duoc gan vao node nao (chua duoc schedule)."
  exit 1
fi

LABEL=$(kubectl get node "$NODE" -o jsonpath='{.metadata.labels.dlp-vaitro}' 2>/dev/null)
if [ "${LABEL:-}" != "worker" ]; then
  echo "Pod 'pinned' dang chay tren node '$NODE', nhung node do khong mang nhan dlp-vaitro=worker."
  echo "Gan nhan roi xoa Pod de tao lai: kubectl delete pod pinned"
  exit 1
fi

CP=$(kubectl get node "$NODE" -o jsonpath="{.metadata.labels.node-role\.kubernetes\.io/control-plane}" 2>/dev/null)
if [ -n "${CP:-}" ]; then
  echo "Pod 'pinned' dang chay tren node '$NODE' - nhung do la node CONTROL-PLANE."
  echo "Bai nay yeu cau ghim xuong node PHU. Tim node con lai bang:"
  echo "  kubectl get nodes -l '!node-role.kubernetes.io/control-plane'"
  exit 1
fi

echo "Dat - Pod 'pinned' Running tren node phu '$NODE' (nhan dlp-vaitro=worker)."

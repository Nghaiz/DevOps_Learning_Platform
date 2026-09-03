#!/bin/sh
# Boot k3s ben trong mot container Docker dang chay TRONG mot pod Sysbox.
#
# Vi sao can file nay chu khong `docker run rancher/k3s server` tran:
# lan chay dau (2026-09-04) kubelet cua k3s chet ngay lap tuc voi
#   cannot enter cgroupv2 "/sys/fs/cgroup/kubepods" with domain controllers
#   -- it is in an invalid state
# Do la rang buoc "no internal process" cua cgroup v2: mot cgroup vua chua
# tien trinh vua bat controller cho con la trang thai khong hop le. Trong
# container, tien trinh k3s NAM NGAY o cgroup goc, nen kubelet khong tao noi
# `kubepods` ben duoi no.
#
# Cach chua chuan (cung cach k3d va tai lieu "cgroup v2 nesting" cua moby
# dung): SO TAN goc — day moi tien trinh xuong mot cgroup con `/init`, roi bat
# controller o `cgroup.subtree_control` cua goc. Sau do goc rong tien trinh va
# hop le lam cha.
set -eu

if [ -f /sys/fs/cgroup/cgroup.controllers ]; then
  mkdir -p /sys/fs/cgroup/init
  # `|| true`: cgroup.procs chi nhan MOT pid moi lan ghi, va mot vai pid co the
  # da thoat giua luc doc va luc ghi. Mot pid khong day duoc khong dang lam hong
  # ca lan boot — neu con sot tien trinh o goc thi buoc bat controller ben duoi
  # se do, va DO moi la cho bao loi dung.
  for pid in $(cat /sys/fs/cgroup/cgroup.procs 2>/dev/null); do
    echo "$pid" > /sys/fs/cgroup/init/cgroup.procs 2>/dev/null || true
  done
  # "cpuset cpu io memory pids" -> "+cpuset +cpu +io +memory +pids"
  sed -e 's/ /+/g' -e 's/^/+/' /sys/fs/cgroup/cgroup.controllers \
    > /sys/fs/cgroup/cgroup.subtree_control
fi

# Mirror cho containerd CUA CLUSTER CON.
#
# `/etc/docker/daemon.json` chi day duoc dockerd cua sandbox. containerd ben
# trong k3s la mot runtime KHAC va khong doc file do — nen khong co doan nay
# thi `kubectl run --image=nginx` trong cluster con se di thang ra
# registry-1.docker.io, dam vao NetworkPolicy deny-all, va treo cho den
# ImagePullBackOff. Trieu chung ("pod cua toi khong bao gio Ready") khong tro ve
# NetworkPolicy o bat cu dau.
if [ -n "${DLP_REGISTRY_MIRROR:-}" ]; then
  mkdir -p /etc/rancher/k3s
  cat > /etc/rancher/k3s/registries.yaml <<REG
mirrors:
  docker.io:
    endpoint:
      - "${DLP_REGISTRY_MIRROR}"
configs:
  "$(echo "${DLP_REGISTRY_MIRROR}" | sed -e 's#^https\?://##' -e 's#/.*##')":
    tls:
      insecure_skip_verify: true
REG
fi

exec /bin/k3s server \
  --disable=traefik \
  --disable=metrics-server \
  --disable=servicelb \
  --disable-helm-controller \
  --tls-san=127.0.0.1 \
  --write-kubeconfig=/output/kubeconfig.yaml \
  --write-kubeconfig-mode=644

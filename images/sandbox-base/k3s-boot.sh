#!/bin/sh
# Boot mot NODE k3s ben trong mot container Docker dang chay TRONG mot pod Sysbox.
#
#   k3s-boot.sh [server|agent]     # mac dinh: server
#
# SSOT: file NAY. Harness do luong 7.B (`infra/host/p7-measure.sh`) scp chinh
# file nay len VM roi mount vao container k3s — khong co ban sao thu hai, vi mot
# ban sao se lech dung vao luc quan trong nhat (khi ai do sua cach so tan cgroup
# o mot ben ma khong sua ben kia).
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
#
# ⚠ VI SAO PHAN SO TAN NAY CHAY CHO CA HAI VAI TRO (P7-bis, 2026-09-04):
# `k3s agent` cung chay MOT kubelet. Node thu hai vi the dam vao DUNG rang buoc
# cgroup v2 o tren — khong phai mot bien the nhe hon cua no. Viet mot nhanh
# `agent` bo qua phan so tan la tai tao lai loi cu duoi mot cai ten khac, va
# trieu chung se la "node 2 mai khong Ready" chu khong tro ve day.
set -eu

ROLE=${1:-server}

case "$ROLE" in
  server | agent) ;;
  *)
    echo "[k3s-boot] vai tro khong hop le: '$ROLE' (chi nhan server|agent)" >&2
    exit 2
    ;;
esac

if [ -f /sys/fs/cgroup/cgroup.controllers ]; then
  mkdir -p /sys/fs/cgroup/init
  # `|| true`: cgroup.procs chi nhan MOT pid moi lan ghi, va mot vai pid co the
  # da thoat giua luc doc va luc ghi. Lap vai vong vi tien trinh moi co the
  # sinh ra giua hai lan doc.
  i=0
  while [ "$i" -lt 5 ]; do
    left=0
    for pid in $(cat /sys/fs/cgroup/cgroup.procs 2>/dev/null); do
      echo "$pid" > /sys/fs/cgroup/init/cgroup.procs 2>/dev/null || left=$((left + 1))
    done
    [ "$left" -eq 0 ] && break
    i=$((i + 1))
  done

  # BAT TUNG CONTROLLER MOT, khong ghi ca chuoi.
  #
  # Lan chay 2026-09-04 ghi ca chuoi "+cpuset +cpu +io +memory +pids" mot lan va
  # nhan `sed: write error` — kernel tu choi CA LUOT khi chi mot controller
  # trong do khong uy quyen duoc xuong muc nay. Ghi tung cai thi cai nao uy
  # quyen duoc van duoc bat, va kubelet chi that su can memory/pids/cpu.
  #
  # Bao cao ro rang cai nao truot, thay vi `2>/dev/null` nuot het: mot cluster
  # con thieu controller `memory` van chay duoc nhung khong ap duoc gioi han —
  # do la dieu nguoi van hanh phai biet, khong phai thu de im lang.
  for c in $(cat /sys/fs/cgroup/cgroup.controllers); do
    if ! echo "+$c" > /sys/fs/cgroup/cgroup.subtree_control 2>/dev/null; then
      echo "[k3s-boot] canh bao: khong uy quyen duoc controller '$c' xuong cgroup con" >&2
    fi
  done
  echo "[k3s-boot] ($ROLE) subtree_control = $(cat /sys/fs/cgroup/cgroup.subtree_control 2>/dev/null)" >&2
fi

# Mirror cho containerd CUA CLUSTER CON.
#
# `/etc/docker/daemon.json` chi day duoc dockerd cua sandbox. containerd ben
# trong k3s la mot runtime KHAC va khong doc file do — nen khong co doan nay
# thi `kubectl run --image=nginx` trong cluster con se di thang ra
# registry-1.docker.io, dam vao NetworkPolicy deny-all, va treo cho den
# ImagePullBackOff. Trieu chung ("pod cua toi khong bao gio Ready") khong tro ve
# NetworkPolicy o bat cu dau.
#
# ⚠ Phai ghi tren CA HAI node: containerd cua agent la mot instance rieng, va
# no keo image cho chinh cac pod duoc lich len node 2. Chi cau hinh o server thi
# trieu chung la "pod nao roi vao node 2 thi ImagePullBackOff" — mot loi ngat
# quang theo lich, thu kho chan doan nhat trong ca ho.
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

if [ "$ROLE" = "agent" ]; then
  # Token + URL la BAT BUOC voi agent. k3s tu doc `K3S_URL`/`K3S_TOKEN` tu env,
  # nhung o day kiem tuong minh: mot agent thieu token khong bao loi ro rang —
  # no lap vo han o buoc dang ky va nguoi doc log chi thay node 2 khong bao gio
  # xuat hien, khong thay ly do.
  : "${K3S_URL:?[k3s-boot] agent can K3S_URL}"
  : "${K3S_TOKEN:?[k3s-boot] agent can K3S_TOKEN}"
  exec /bin/k3s agent --server "$K3S_URL" --token "$K3S_TOKEN"
fi

# Token CO DINH thay vi de k3s sinh ngau nhien roi doc lai tu
# /var/lib/rancher/k3s/server/node-token: doc file do la mot cuoc dua (agent
# phai poll cho toi khi server ghi xong), va mot cuoc dua trong duong khoi dong
# se hong ngat quang duoi tai — dung kieu loi khong tai hien duoc.
set -- \
  --disable=traefik \
  --disable=metrics-server \
  --disable=servicelb \
  --disable-helm-controller \
  --tls-san=127.0.0.1 \
  --tls-san=dlp-k3s \
  --write-kubeconfig=/output/kubeconfig.yaml \
  --write-kubeconfig-mode=644

# Nhanh tuong minh thay vi mot dang mo rong ${K3S_TOKEN:+...} khong boc ngoac:
# ket qua cua dang do BI TACH TRUONG. Hom nay token khong co khoang trang nen
# no "chay dung", va do chinh la kieu hong se lo vao mot ngay nao do duoi mot
# token khac chu khong lo hom nay.
if [ -n "${K3S_TOKEN:-}" ]; then
  set -- "$@" --token "$K3S_TOKEN"
fi

exec /bin/k3s server "$@"

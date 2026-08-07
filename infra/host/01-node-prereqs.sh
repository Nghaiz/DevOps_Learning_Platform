#!/usr/bin/env bash
# 01-node-prereqs.sh — Cài mọi thứ kubeadm + Sysbox cần, TRƯỚC khi init cluster.
# Idempotent: chạy lại nhiều lần không hỏng. Chạy được trên cả Debian lẫn Ubuntu.
#
# HAI GHIM QUAN TRỌNG:
#
#  1. K8S_VERSION = v1.34. Sysbox CHỈ hỗ trợ v1.32–v1.35 và đây là điều kiện `die` THẬT
#     trong trình cài đặt. kubectl "stable" hiện tại đã là v1.36.x.
#
#  2. containerd lấy từ repo Docker (containerd.io 2.3.x), KHÔNG dùng gói containerd của
#     Debian (1.7.x). Lý do: is_containerd_with_userns() trong sysbox-deploy-k8s.sh yêu cầu
#     containerd >= 2.0.0 (trừ dải lỗi 2.0.1–2.0.4). Đạt ngưỡng đó thì daemonset dùng
#     user-namespace của containerd và KHÔNG cài CRI-O — ít bộ phận chuyển động hơn hẳn.
#     Muốn ép CRI-O: SYSBOX_USE_CRIO=true khi chạy 03.

set -euo pipefail

K8S_VERSION="${K8S_VERSION:-v1.34}"
CONTAINERD_MIN="2.0.5"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32m✔\033[0m %s\n' "$*"; }
info() { printf '    \033[33mi\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31mLỖI: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Chạy bằng root: sudo bash $0"

case "$K8S_VERSION" in
  v1.32|v1.33|v1.34|v1.35) ;;
  *) die "K8S_VERSION=$K8S_VERSION ngoài dải Sysbox hỗ trợ (v1.32–v1.35). Trình cài đặt sẽ die." ;;
esac

# shellcheck disable=SC1091
. /etc/os-release
DISTRO_ID="${ID:-debian}"
DISTRO_CODENAME="${VERSION_CODENAME:-trixie}"
case "$DISTRO_ID" in
  debian|ubuntu) ok "Distro: $PRETTY_NAME (repo Docker: $DISTRO_ID/$DISTRO_CODENAME)" ;;
  *) die "Script này viết cho Debian/Ubuntu, phát hiện '$DISTRO_ID'." ;;
esac

export DEBIAN_FRONTEND=noninteractive

# ------------------------------------------------------------------ 1. Tắt swap
log "1/7 Tắt swap (kubelet không chạy khi còn swap)"
swapoff -a
if grep -qE '^[^#].*\sswap\s' /etc/fstab; then
  cp /etc/fstab "/etc/fstab.bak.$(date +%s)"
  sed -i -E 's|^([^#].*\sswap\s.*)$|# \1  # disabled by 01-node-prereqs.sh|' /etc/fstab
  ok "đã comment dòng swap trong /etc/fstab (đã backup)"
else
  ok "fstab không có swap"
fi
# Debian 13 có thể dùng swapfile qua systemd thay vì fstab
systemctl list-units --type=swap --no-legend 2>/dev/null | awk '{print $1}' | while read -r u; do
  [ -n "$u" ] && systemctl mask "$u" >/dev/null 2>&1 && echo "    masked swap unit: $u"
done || true

# ------------------------------------------------------------------ 2. Gói nền
log "2/7 Gói nền (Debian minimal thiếu nhiều thứ Ubuntu có sẵn)"
apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl gnupg jq apt-transport-https \
  iptables iproute2 socat conntrack ethtool
ok "đã cài gói nền"

# ------------------------------------------------------------------ 3. Kernel modules + sysctl
log "3/7 Kernel modules + sysctl"
cat > /etc/modules-load.d/k8s.conf <<'EOF'
overlay
br_netfilter
EOF
modprobe overlay
modprobe br_netfilter

cat > /etc/sysctl.d/99-kubernetes.conf <<'EOF'
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
# Sysbox cần nhiều user namespace + inotify cho mỗi sandbox pod
user.max_user_namespaces            = 65536
fs.inotify.max_user_watches         = 1048576
fs.inotify.max_user_instances       = 8192
EOF

# Ubuntu 23.10+ chặn unprivileged userns bằng AppArmor. Debian 13 không bật — nhưng
# ghi vô điều kiện để script chạy đúng trên cả hai, và phòng Debian đổi mặc định sau này.
if [ -e /proc/sys/kernel/apparmor_restrict_unprivileged_userns ]; then
  echo 'kernel.apparmor_restrict_unprivileged_userns = 0' >> /etc/sysctl.d/99-kubernetes.conf
  info "phát hiện khoá AppArmor userns → đã đặt = 0 (Sysbox cần unprivileged userns)"
fi

sysctl --system >/dev/null
ok "modules loaded, sysctl applied"

# ------------------------------------------------------------------ 4. containerd (repo Docker)
log "4/7 containerd.io từ repo Docker (cần >= $CONTAINERD_MIN cho đường userns)"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL "https://download.docker.com/linux/${DISTRO_ID}/gpg" \
  | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
chmod 0644 /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${DISTRO_ID} ${DISTRO_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -qq
apt-get install -y -qq containerd.io \
  || die "Không cài được containerd.io cho ${DISTRO_ID}/${DISTRO_CODENAME}.
     Repo Docker cho trixie từng thiếu gói (docker/packaging#342). Đường vòng: tải .deb tay từ
     https://download.docker.com/linux/debian/dists/trixie/pool/stable/amd64/ rồi dpkg -i."

mkdir -p /etc/containerd
if [ ! -s /etc/containerd/config.toml ] || ! grep -q 'SystemdCgroup' /etc/containerd/config.toml; then
  containerd config default > /etc/containerd/config.toml
fi
# kubelet dùng systemd cgroup driver -> containerd phải khớp, nếu không kubelet crashloop
sed -i 's/^\(\s*\)SystemdCgroup = false/\1SystemdCgroup = true/' /etc/containerd/config.toml
grep -q 'SystemdCgroup = true' /etc/containerd/config.toml \
  || die "Không set được SystemdCgroup=true trong /etc/containerd/config.toml — kiểm tra tay."

systemctl restart containerd
systemctl enable --now containerd >/dev/null 2>&1 || true

CTD_VER="$(containerd --version | awk '{print $3}' | sed 's/^v//')"
ok "containerd $CTD_VER, SystemdCgroup=true"

# Cho biết trước đường nào sẽ thắng ở bước 03
if printf '%s\n%s\n' "$CONTAINERD_MIN" "$CTD_VER" | sort -V -C; then
  case "$CTD_VER" in
    2.0.1|2.0.2|2.0.3|2.0.4)
      info "containerd $CTD_VER nằm trong DẢI LỖI 2.0.1–2.0.4 → 03 sẽ cài CRI-O thay thế." ;;
    *)
      ok "containerd $CTD_VER >= $CONTAINERD_MIN → 03 dùng userns containerd, KHÔNG cài CRI-O." ;;
  esac
else
  info "containerd $CTD_VER < $CONTAINERD_MIN → 03 sẽ tự cài CRI-O (tarball, chạy được trên Debian)."
fi

# ------------------------------------------------------------------ 5. kubeadm/kubelet/kubectl
log "5/7 kubeadm/kubelet/kubectl ghim $K8S_VERSION"
curl -fsSL "https://pkgs.k8s.io/core:/stable:/${K8S_VERSION}/deb/Release.key" \
  | gpg --dearmor --yes -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
chmod 0644 /etc/apt/keyrings/kubernetes-apt-keyring.gpg

echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/${K8S_VERSION}/deb/ /" \
  > /etc/apt/sources.list.d/kubernetes.list

apt-get update -qq
apt-mark unhold kubelet kubeadm kubectl >/dev/null 2>&1 || true
apt-get install -y -qq kubelet kubeadm kubectl
apt-mark hold kubelet kubeadm kubectl >/dev/null
systemctl enable --now kubelet >/dev/null 2>&1 || true
ok "$(kubeadm version -o short) — apt-mark hold (apt sẽ KHÔNG tự nâng lên v1.36)"

# ------------------------------------------------------------------ 6. Giới hạn hệ thống
log "6/7 Nâng giới hạn file/pid cho warm-pool nhiều pod"
mkdir -p /etc/systemd/system.conf.d
cat > /etc/systemd/system.conf.d/99-sandbox-limits.conf <<'EOF'
[Manager]
DefaultLimitNOFILE=1048576
DefaultTasksMax=infinity
EOF
systemctl daemon-reexec
ok "NOFILE=1048576, TasksMax=infinity"

# ------------------------------------------------------------------ 7. Xác minh
log "7/7 Xác minh"
systemctl is-active --quiet containerd || die "containerd không active"
ok "containerd active"
[ "$(cat /proc/sys/user/max_user_namespaces)" -gt 0 ] || die "unprivileged userns vẫn tắt"
ok "user namespaces bật"

printf '\n\033[32mXong 01.\033[0m Bước tiếp: sudo bash 02-kubeadm-init.sh\n\n'

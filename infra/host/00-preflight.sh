#!/usr/bin/env bash
# 00-preflight.sh — Kiểm tra host ĐỦ ĐIỀU KIỆN chạy Sysbox trước khi cài bất cứ thứ gì.
# Fail sớm, fail rõ. Không cài, không sửa gì — chỉ đọc.
#
# Target: Debian 13 "Trixie" (kernel 6.12). Ubuntu vẫn chạy được, chỉ khác vài cảnh báo.
#
# Điều kiện lấy từ CHÍNH mã nguồn trình cài đặt (sysbox-pkgr/k8s/scripts/sysbox-deploy-k8s.sh),
# không lấy từ docs — docs lạc hậu hơn code:
#   is_supported_distro() : allowlist có [[ $distro =~ "debian" ]]; distro lạ chỉ WARN, không die
#   is_supported_kernel() : Ubuntu >= 5.3 ; MỌI distro khác >= 5.5
#   3 điều kiện die duy nhất: kernel, kiến trúc, phiên bản K8s
#
# Chạy:  bash 00-preflight.sh      Exit 0 = hợp lệ, exit 1 = có blocker.

set -uo pipefail

FAIL=0
WARN=0

ok()    { printf '  \033[32m✔\033[0m %s\n' "$*"; }
bad()   { printf '  \033[31m✘\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; WARN=$((WARN + 1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$*"; }

head_ "Host preflight — Sysbox + kubeadm (target: Debian 13 Trixie)"

# ---------------------------------------------------------------- 1. Không phải WSL
head_ "1. Loại kernel"
if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; then
  bad "Đây là WSL. Sysbox KHÔNG hỗ trợ WSL (changelog v0.7.1 không có mục WSL nào,"
  bad "  và kernel WSL là bản Microsoft vá riêng, chưa từng được test)."
  bad "  → Dùng VM Debian thật (VMware) hoặc cloud VM."
else
  ok "Kernel thật, không phải WSL ($(uname -r))"
fi

# ---------------------------------------------------------------- 2. systemd là PID 1
head_ "2. Process manager"
PID1="$(ps -p 1 -o comm= 2>/dev/null || echo unknown)"
if [ "$PID1" = "systemd" ]; then
  ok "systemd là PID 1"
else
  bad "PID 1 = '$PID1', không phải systemd. Sysbox bắt buộc systemd làm process manager."
fi

# ---------------------------------------------------------------- 3. Distro
head_ "3. Distro (khớp is_supported_distro của trình cài đặt)"
DISTRO_ID=""; DISTRO_VER=""
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  DISTRO_ID="${ID:-}"; DISTRO_VER="${VERSION_ID:-}"
  case "$DISTRO_ID" in
    debian)
      if [ "${DISTRO_VER%%.*}" -ge 13 ] 2>/dev/null; then
        ok "$PRETTY_NAME — khớp nhánh 'debian' trong allowlist, kernel mới, LTS dài"
      else
        warn "$PRETTY_NAME — vẫn khớp allowlist 'debian' nhưng nên dùng Debian 13 Trixie"
        warn "  (Debian 11 Bullseye hết LTS 31/08/2026)"
      fi ;;
    ubuntu)
      ok "$PRETTY_NAME — trong allowlist"
      warn "Ubuntu 24.04+ bật apparmor_restrict_unprivileged_userns=1 mặc định — xem mục 5" ;;
    *)
      warn "$PRETTY_NAME — ngoài allowlist. Trình cài đặt chỉ in Warning rồi CHẠY TIẾP"
      warn "  (không die). Nhưng bạn tự chịu rủi ro; nên dùng Debian 13." ;;
  esac
else
  bad "Không đọc được /etc/os-release"
fi

# ---------------------------------------------------------------- 4. Kernel version
head_ "4. Kernel version (gate CỨNG — đây là die thật trong trình cài đặt)"
KVER="$(uname -r | cut -d- -f1)"
kmajor="${KVER%%.*}"; krest="${KVER#*.}"; kminor="${krest%%.*}"
knum=$((kmajor * 1000 + kminor))

if [ "$DISTRO_ID" = "ubuntu" ]; then MIN=5003; MINTXT="5.3 (Ubuntu)"; else MIN=5005; MINTXT="5.5 (non-Ubuntu)"; fi
if [ "$knum" -lt "$MIN" ]; then
  bad "kernel $KVER < $MINTXT → trình cài đặt sẽ die. Blocker cứng."
else
  ok "kernel $KVER >= $MINTXT"
fi

# shiftfs là patch RIÊNG của kernel Ubuntu — Debian không bao giờ có.
# Từ kernel 5.19 trở lên dùng idmapped mounts thay thế ⇒ Debian hợp lệ.
if [ "$knum" -ge 5019 ]; then
  ok "kernel >= 5.19 → dùng idmapped mounts, KHÔNG cần shiftfs (đây là lý do Debian chạy được)"
else
  bad "kernel $KVER < 5.19 → cần shiftfs, mà shiftfs CHỈ có trên kernel Ubuntu."
  bad "  Trên Debian đây là blocker cứng. Nâng lên Debian 13 (kernel 6.12)."
fi

# ---------------------------------------------------------------- 5. User namespaces
head_ "5. User namespaces (Sysbox sống nhờ cái này)"
MAXUSERNS="$(cat /proc/sys/user/max_user_namespaces 2>/dev/null || echo 0)"
if [ "${MAXUSERNS:-0}" -gt 0 ] 2>/dev/null; then
  ok "max_user_namespaces = $MAXUSERNS"
else
  bad "max_user_namespaces = 0 → unprivileged userns bị tắt. Sysbox không chạy được."
  bad "  Sửa: sudo sysctl -w user.max_user_namespaces=65536"
fi

# Ubuntu 23.10+ thêm khoá AppArmor chặn unprivileged userns. Debian 13 KHÔNG bật mặc định.
AA_KNOB=/proc/sys/kernel/apparmor_restrict_unprivileged_userns
if [ -r "$AA_KNOB" ]; then
  AA="$(cat "$AA_KNOB")"
  if [ "$AA" = "1" ]; then
    bad "apparmor_restrict_unprivileged_userns = 1 → AppArmor đang CHẶN unprivileged userns."
    bad "  Sửa: echo 'kernel.apparmor_restrict_unprivileged_userns=0' | sudo tee /etc/sysctl.d/99-userns.conf && sudo sysctl --system"
  else
    ok "apparmor_restrict_unprivileged_userns = 0 (không chặn)"
  fi
else
  ok "không có khoá apparmor_restrict_unprivileged_userns (mặc định của Debian — thuận lợi)"
fi

# ---------------------------------------------------------------- 6. Kiến trúc
head_ "6. Kiến trúc (gate CỨNG)"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ok "$ARCH" ;;
  aarch64|arm64) warn "$ARCH — Sysbox có bản arm64 nhưng image sandbox phải build multi-arch" ;;
  *) bad "$ARCH — không được hỗ trợ, trình cài đặt sẽ die" ;;
esac

# ---------------------------------------------------------------- 7. Tài nguyên
head_ "7. Tài nguyên (Sysbox docs: tối thiểu 4 CPU / 4GB RAM mỗi node)"
CPUS="$(nproc)"
if   [ "$CPUS" -ge 8 ]; then ok   "$CPUS vCPU"
elif [ "$CPUS" -ge 4 ]; then warn "$CPUS vCPU — đủ tối thiểu, warm-pool nhiều pod sẽ chật"
else                         bad  "$CPUS vCPU — dưới mức tối thiểu 4"
fi

MEM_MB="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
if   [ "$MEM_MB" -ge 15000 ]; then ok   "${MEM_MB} MB RAM"
elif [ "$MEM_MB" -ge 4000  ]; then warn "${MEM_MB} MB RAM — đủ tối thiểu, nên >= 16GB cho warm-pool"
else                               bad  "${MEM_MB} MB RAM — dưới mức tối thiểu 4GB"
fi

DISK_GB="$(df -BG --output=avail / | tail -1 | tr -dc '0-9')"
if   [ "${DISK_GB:-0}" -ge 80 ]; then ok   "${DISK_GB} GB trống trên /"
elif [ "${DISK_GB:-0}" -ge 40 ]; then warn "${DISK_GB} GB trống — đủ chạy, sẽ chật khi build image sandbox"
else                                  bad  "${DISK_GB} GB trống — cần >= 40GB, nên 100GB+"
fi

# ---------------------------------------------------------------- 8. Swap
head_ "8. Swap (kubelet yêu cầu tắt)"
SWAP_KB="$(awk '/SwapTotal/ {print $2}' /proc/meminfo)"
if [ "$SWAP_KB" -eq 0 ]; then
  ok "swap đã tắt"
else
  warn "swap đang bật ($((SWAP_KB / 1024)) MB) — 01-node-prereqs.sh sẽ tắt giúp"
  warn "  (Trình cài Debian mặc định TẠO swap partition — chuyện bình thường)"
fi

# ---------------------------------------------------------------- 9. Công cụ + mạng
head_ "9. Công cụ & mạng"
# Debian minimal KHÔNG có sudo/curl sẵn — khác Ubuntu. Đây là bẫy hay gặp nhất.
# Chỉ 'sudo' là blocker. curl/gnupg KHÔNG phải: 01-node-prereqs.sh cài chúng bằng apt,
# mà apt không cần curl để chạy.
if [ "$(id -u)" -eq 0 ]; then
  ok "đang chạy bằng root"
elif command -v sudo >/dev/null 2>&1; then
  ok "có sudo"
  if sudo -n true 2>/dev/null; then
    ok "sudo không cần nhập lại mật khẩu"
  else
    warn "sudo sẽ hỏi mật khẩu — chạy setup-all.sh qua 'ssh -t' để có TTY mà nhập"
  fi
else
  bad "thiếu 'sudo' và không phải root."
  bad "  ĐỪNG dùng 'su -': mật khẩu root để trống ⇒ tài khoản root bị khoá ⇒ luôn"
  bad "  'Authentication failure' dù bạn gõ đúng mật khẩu user. Đó là mật khẩu KHÁC."
  bad "  Sửa: đăng nhập root ở console VMware rồi 'apt install -y sudo && adduser $USER sudo',"
  bad "  đăng xuất, đăng nhập lại. Hoặc cài lại Debian và để TRỐNG mật khẩu root."
fi

for t in curl gpg; do
  command -v "$t" >/dev/null 2>&1 && ok "có $t" \
    || warn "thiếu '$t' — 01-node-prereqs.sh sẽ cài (muốn cài trước: sudo apt install -y curl gnupg)"
done

# Chưa có curl thì vẫn đo được DNS + TCP/443 bằng bash /dev/tcp — đủ để phân biệt
# "VM không có mạng" (blocker thật) với "chỉ là chưa cài curl" (không phải blocker).
probe_net() {
  local host="$1" path="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 10 -o /dev/null "https://$host$path" 2>/dev/null \
      && ok "ra được $host$path" \
      || bad "không ra được $host$path — kiểm tra mạng/DNS/proxy của VM"
  elif ! getent hosts "$host" >/dev/null 2>&1; then
    bad "không phân giải được DNS cho $host — kiểm tra mạng/DNS của VM"
  elif timeout 8 bash -c "exec 3<>/dev/tcp/$host/443" 2>/dev/null; then
    ok "mở được TCP 443 tới $host (chưa có curl nên chỉ kiểm được tới mức này)"
  else
    bad "không mở được TCP 443 tới $host — kiểm tra mạng/firewall/proxy của VM"
  fi
}

probe_net pkgs.k8s.io         "/core:/stable:/${K8S_VERSION:-v1.34}/deb/Release.key"
probe_net download.docker.com "/linux/debian/gpg"

# ---------------------------------------------------------------- Kết luận
head_ "Kết luận"
if [ "$FAIL" -gt 0 ]; then
  printf '  \033[31m%d blocker\033[0m, %d cảnh báo → DỪNG. Sửa blocker rồi chạy lại.\n\n' "$FAIL" "$WARN"
  exit 1
fi
printf '  \033[32mHost hợp lệ\033[0m (%d cảnh báo). Bước tiếp: sudo bash 01-node-prereqs.sh\n\n' "$WARN"

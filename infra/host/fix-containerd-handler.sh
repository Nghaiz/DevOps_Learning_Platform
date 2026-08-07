#!/usr/bin/env bash
# fix-containerd-handler.sh — Chẩn đoán (và sửa) việc containerd KHÔNG đăng ký runtime
# handler 'sysbox-runc', dẫn tới lỗi khi tạo pod:
#
#   Failed to create pod sandbox: can't set `spec.hostUsers: false`,
#   RuntimeClass handler "sysbox-runc" does not support user namespaces:
#   the handler "sysbox-runc" is not known
#
# NGUYÊN NHÂN GỐC — lệch schema config giữa containerd đời mới và trình cài Sysbox:
#   * config_containerd_for_sysbox() của sysbox-deploy-k8s ghi vào plugin ID đời containerd 1.x:
#     plugins."io.containerd.grpc.v1.cri".containerd.runtimes.sysbox-runc
#   * containerd 2.x đổi ID sang io.containerd.cri.v1.runtime (config version 3) và còn đổi tiếp
#     ở các bản sau. `containerd config default` sinh file theo version MỚI NHẤT.
#   * containerd chỉ migrate ID cũ khi CẢ FILE khai version = 2. File version mới hơn mà chứa
#     section ID cũ thì section đó bị BỎ QUA IM LẶNG — không lỗi, không cảnh báo.
#   ⇒ RuntimeClass 'sysbox-runc' có trong k8s (daemonset tạo), nhưng CRI không có handler tương
#     ứng. kubelet tra danh sách handler từ CRI Status() → không thấy → báo "not known".
#
# Script KHÔNG hardcode bảng version→plugin-ID (bảng đó lạc hậu mỗi lần containerd lên đời).
# Nó SUY plugin ID từ chính entry 'runc' trong `containerd config dump` — tức là từ schema mà
# containerd trên máy này đang thực sự dùng.
#
# Mặc định chỉ ĐỌC và in bằng chứng. Sửa thật:  sudo FIX=1 bash fix-containerd-handler.sh

set -uo pipefail

CFG="${CFG:-/etc/containerd/config.toml}"
FIX="${FIX:-0}"
HANDLER="${HANDLER:-sysbox-runc}"

ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
bad()  { printf '  \033[31m✘\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die()  { printf '\n\033[31mLỖI: %s\033[0m\n' "$*" >&2; exit 1; }

SUDO=""
[ "$(id -u)" -eq 0 ] || SUDO="sudo"

# ------------------------------------------------------------------ 1. containerd + file config
log "1/6 containerd và file config"
command -v containerd >/dev/null || die "Không có containerd trên máy này."
ok "containerd $(containerd --version | awk '{print $3}' | sed 's/^v//')"

[ -r "$CFG" ] || die "Không đọc được $CFG"
CFG_VER="$(grep -E '^[[:space:]]*version[[:space:]]*=' "$CFG" | head -1 | tr -dc '0-9')"
ok "$CFG — config version = ${CFG_VER:-(không khai báo)}"

# ------------------------------------------------------------------ 2. Suy plugin ID từ 'runc'
log "2/6 Plugin ID thật (suy từ entry 'runc' trong config dump)"
DUMP="$($SUDO containerd config dump 2>/dev/null)"
[ -n "$DUMP" ] || die "'containerd config dump' không trả về gì (thiếu quyền?). Thử: sudo bash $0"

RUNC_LINE="$(printf '%s\n' "$DUMP" | grep -E "^[[:space:]]*\[plugins\..*\.containerd\.runtimes\.runc\][[:space:]]*$" | head -1)"
if [ -z "$RUNC_LINE" ]; then
  bad "Không tìm thấy entry 'runc' trong config dump — schema lạ, script không tự suy được."
  printf '\nCác section [plugins...] mà containerd đang dùng:\n'
  printf '%s\n' "$DUMP" | grep -E "^\[plugins\." | head -30 | sed 's/^/    /'
  die "Gửi lại output ở trên để cập nhật script."
fi

PLUGIN_ID="$(printf '%s' "$RUNC_LINE" \
  | sed -E "s/^[[:space:]]*\[plugins\.[\"']?//; s/[\"']?\.containerd\.runtimes\.runc\][[:space:]]*$//")"
[ -n "$PLUGIN_ID" ] || die "Không tách được plugin ID từ dòng: $RUNC_LINE"
ok "plugin ID = '$PLUGIN_ID'"

# In luôn block runc để thấy đúng tên khoá của schema này (runtime_type / BinaryName / ...)
printf '\n    Block runc mà containerd đang dùng (mẫu để nhân bản):\n'
printf '%s\n' "$DUMP" | sed -n "/^[[:space:]]*\[plugins\..*\.containerd\.runtimes\.runc\][[:space:]]*$/,/^\[plugins\..*runtimes\.[a-z]/p" \
  | head -20 | sed 's/^/      /'

printf '%s' "$DUMP" | grep -q 'runtime_type' \
  || warn "không thấy khoá 'runtime_type' — schema có thể đã đổi tên khoá, xem block ở trên"

# ------------------------------------------------------------------ 3. Binary sysbox-runc
log "3/6 Binary sysbox-runc trên host"
BIN=""
for p in /usr/bin/sysbox-runc /usr/local/bin/sysbox-runc /usr/local/sbin/sysbox-runc /usr/sbin/sysbox-runc; do
  [ -x "$p" ] && { BIN="$p"; break; }
done
[ -n "$BIN" ] || BIN="$(command -v sysbox-runc 2>/dev/null || true)"
if [ -n "$BIN" ]; then
  ok "$BIN ($("$BIN" --version 2>/dev/null | head -1 || echo 'không đọc được version'))"
else
  bad "không tìm thấy sysbox-runc — daemonset chưa cài xong binary lên host."
  bad "  Xem log: kubectl logs -n kube-system ds/sysbox-deploy-k8s --tail=100"
  exit 1
fi

for svc in sysbox-mgr sysbox-fs; do
  systemctl is-active --quiet "$svc" && ok "$svc đang chạy" || bad "$svc KHÔNG chạy (systemctl status $svc)"
done

# ------------------------------------------------------------------ 4. Section trong file config
log "4/6 Section '$HANDLER' trong $CFG"
HAS_CORRECT=0
grep -E "^[[:space:]]*\[plugins\.[\"']?${PLUGIN_ID//./\\.}[\"']?\.containerd\.runtimes\.${HANDLER}\]" "$CFG" >/dev/null 2>&1 && HAS_CORRECT=1

# Section sysbox-runc đang nằm dưới plugin ID NÀO (bất kể ID gì)
mapfile -t FOUND_IDS < <(grep -E "^[[:space:]]*\[plugins\..*\.containerd\.runtimes\.${HANDLER}\]" "$CFG" 2>/dev/null \
  | sed -E "s/^[[:space:]]*\[plugins\.[\"']?//; s/[\"']?\.containerd\.runtimes\.${HANDLER}\][[:space:]]*$//")

if [ "$HAS_CORRECT" = "1" ]; then
  ok "đã có section dưới plugin ID đúng ('$PLUGIN_ID')"
elif [ "${#FOUND_IDS[@]}" -gt 0 ]; then
  bad "CÓ section '$HANDLER' nhưng nằm dưới plugin ID SAI:"
  for id in "${FOUND_IDS[@]}"; do bad "    '$id'   (đúng phải là '$PLUGIN_ID')"; done
  bad "  ⇒ containerd BỎ QUA section này. Đây chính là nguyên nhân."
else
  bad "KHÔNG có section '$HANDLER' nào trong $CFG."
fi

# ------------------------------------------------------------------ 5. containerd nạp được gì
log "5/6 containerd/CRI có thấy '$HANDLER' không"
LOADED=0
if printf '%s' "$DUMP" | grep -qF "runtimes.$HANDLER"; then
  ok "containerd có nạp '$HANDLER'"; LOADED=1
else
  bad "containerd KHÔNG nạp '$HANDLER' — handler không tồn tại ở tầng CRI."
fi

if command -v crictl >/dev/null 2>&1; then
  $SUDO crictl info 2>/dev/null | grep -qF "$HANDLER" \
    && ok "crictl info thấy '$HANDLER'" \
    || bad "crictl info KHÔNG thấy '$HANDLER' — đúng cái kubelet tra và không tìm ra."
fi

# Cổng THỨ HAI, độc lập với việc đăng ký: containerd suy ra 'supports_user_namespaces' của handler
# từ output `<binary> features`. Đăng ký xong mà binary không khai báo namespace 'user' thì kubelet
# vẫn từ chối — lúc đó thông báo đổi thành 'does not support user namespaces' KHÔNG kèm 'not known'.
if FEAT="$("$BIN" features 2>/dev/null)"; then
  printf '%s' "$FEAT" | grep -q '"user"' \
    && ok "sysbox-runc khai báo hỗ trợ user namespace trong \`features\`" \
    || warn "sysbox-runc KHÔNG khai báo namespace 'user' — đăng ký xong kubelet vẫn có thể từ chối"
else
  warn "'$BIN features' không chạy được — chưa xác minh được khai báo userns (chưa chắc là hỏng)"
fi

# ------------------------------------------------------------------ 6. Sửa
log "6/6 Sửa"
if [ "$LOADED" = "1" ] && [ "$HAS_CORRECT" = "1" ]; then
  ok "Không có gì để sửa. Nếu pod vẫn fail, xem: journalctl -u kubelet -n 80"
  exit 0
fi

if [ "$FIX" != "1" ]; then
  printf '  Chưa sửa gì (chế độ chỉ-đọc). Chạy lệnh sau để sửa:\n\n'
  printf '    sudo FIX=1 bash %s\n\n' "$0"
  printf '  Nó sẽ: backup %s → thêm section dưới plugin ID "%s"\n' "$CFG" "$PLUGIN_ID"
  printf '         → restart containerd + kubelet → kiểm chứng lại.\n\n'
  exit 1
fi

[ "$(id -u)" -eq 0 ] || die "FIX=1 cần root. Chạy: sudo FIX=1 bash $0"

BAK="${CFG}.bak.$(date +%s)"
cp "$CFG" "$BAK"
ok "đã backup → $BAK"

# TOML cấm khai báo trùng table. Section ID cũ (bị bỏ qua) vô hại, để nguyên làm dấu vết.
cat >> "$CFG" <<EOF

# --- thêm bởi fix-containerd-handler.sh: sysbox-runc dưới plugin ID mà containerd đang dùng ---
[plugins.'${PLUGIN_ID}'.containerd.runtimes.${HANDLER}]
  runtime_type = 'io.containerd.runc.v2'
  [plugins.'${PLUGIN_ID}'.containerd.runtimes.${HANDLER}.options]
    BinaryName = '${BIN}'
    SystemdCgroup = true
EOF
ok "đã thêm section [plugins.'${PLUGIN_ID}'.containerd.runtimes.${HANDLER}]"

systemctl restart containerd \
  || die "containerd không restart được. Khôi phục: cp $BAK $CFG && systemctl restart containerd"
sleep 3
systemctl is-active --quiet containerd \
  || die "containerd chết sau restart (config sai?). Khôi phục: cp $BAK $CFG && systemctl restart containerd
     Log: journalctl -u containerd -n 50"
ok "containerd restart xong"

# kubelet lấy danh sách handler từ CRI Status(). Restart cho chắc, khỏi chờ chu kỳ refresh.
systemctl restart kubelet || warn "kubelet không restart được — thử tay: systemctl restart kubelet"
sleep 5
ok "kubelet restart xong"

log "Kiểm chứng sau khi sửa"
FAILED=0
$SUDO containerd config dump 2>/dev/null | grep -qF "runtimes.$HANDLER" \
  && ok "containerd đã nạp '$HANDLER'" || { bad "containerd VẪN không nạp '$HANDLER'"; FAILED=1; }

if command -v crictl >/dev/null 2>&1; then
  $SUDO crictl info 2>/dev/null | grep -qF "$HANDLER" \
    && ok "crictl info thấy '$HANDLER'" || { bad "crictl info VẪN không thấy '$HANDLER'"; FAILED=1; }
fi

if [ "$FAILED" = "1" ]; then
  printf '\n\033[31mVẫn hỏng.\033[0m Backup ở %s. Gửi lại output của:\n' "$BAK"
  printf '  sudo containerd config dump | grep -B2 -A6 sysbox\n'
  printf '  journalctl -u containerd -n 50 --no-pager\n\n'
  exit 1
fi

printf '\n\033[32mXong.\033[0m Chạy lại cổng P0.F:  bash ~/host/04-verify-sysbox.sh\n\n'

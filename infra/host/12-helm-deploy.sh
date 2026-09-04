#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# 12-helm-deploy.sh — deploy chart platform lên VM lab TỪ chart TƯƠI của repo.
#
# VÌ SAO SCRIPT NÀY TỒN TẠI — nó đóng một cái bẫy, không phải thêm tiện nghi.
#
# Trước script này, deploy đi qua `~/dlp-deploy` trên VM: một BẢN CHÉP TAY của
# chart, đồng bộ lần cuối ở một commit CŨ (595e20b, 2026-08-14). `helm upgrade`
# từ đó dùng template ĐỜI CŨ, nên mọi thay đổi template sau lần chép (3.C/3.F/3.H)
# bị LẶNG LẼ gỡ đi — pod vẫn Running 1/1, helm vẫn "success", mà tính năng mới
# biến mất. Đúng lớp lỗi khó lần nhất. `~/dlp-deploy` KHÔNG phải git repo nên nó
# không tự cập nhật; nó chỉ già đi.
#
# ⛔ NGUỒN SỰ THẬT CỦA CHART LÀ REPO NÀY, KHÔNG PHẢI MỘT THƯ MỤC TRÊN VM.
# Script luôn `rsync` chart tươi từ repo lên một thư mục MỚI trên VM rồi upgrade
# từ đó. Không có bản chép nào sống qua hai lần deploy để mà già đi.
#
# BÍ MẬT (mật khẩu Postgres/Redis, betterAuthSecret) KHÔNG rời VM và KHÔNG vào
# git: script đọc chúng bằng `helm get values` NGAY TRÊN VM vào một overlay tạm,
# dùng cho upgrade, rồi xoá. Chúng không đi qua máy dev, không qua `--set` (tránh
# nằm lại trong shell history / log).
#
# Dùng:
#   bash infra/host/12-helm-deploy.sh                          # upgrade + cổng smoke
#   bash infra/host/12-helm-deploy.sh --no-smoke               # bỏ cổng smoke (hiếm khi đúng)
#   bash infra/host/12-helm-deploy.sh -f infra/helm/.../x.yaml # thêm overlay (đè cuối)
#   VM_SSH=nghaiz@192.168.94.130 bash infra/host/12-helm-deploy.sh
#
# Chạy TỪ MÁY DEV (nơi có repo). Không nhận secret trên dòng lệnh — cố ý.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHART_SRC="${REPO_ROOT}/infra/helm/platform"
VM_SSH="${VM_SSH:-nghaiz@192.168.94.130}"
RELEASE="${RELEASE:-platform}"
NAMESPACE="${NAMESPACE:-default}"
SELFHOST_VALUES="values-selfhost.yaml" # tên file bên trong chart

loi() { echo "LỖI: $*" >&2; exit 1; }

# Overlay bổ sung (đè SAU secret) — ví dụ ghim tag image tạm cho một lượt đo.
# Đường dẫn tương đối repo; script scp từng cái lên VM.
EXTRA_OVERLAYS=()
RUN_SMOKE=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    -f) shift; EXTRA_OVERLAYS+=("$1"); shift ;;
    --no-smoke) RUN_SMOKE=0; shift ;;
    *)  loi "tham số lạ: $1 (chỉ nhận -f <overlay> | --no-smoke)" ;;
  esac
done

[[ -d "$CHART_SRC" ]] || loi "không thấy chart ở $CHART_SRC"
command -v tar >/dev/null 2>&1 || loi "cần tar trên máy dev"
ssh -o ConnectTimeout=8 "$VM_SSH" true 2>/dev/null || loi "không ssh được tới $VM_SSH"

# Thư mục MỚI mỗi lần — không dùng đường cố định để không có bản nào sống dai.
# tar-over-ssh thay vì rsync: Git Bash trên Windows KHÔNG có rsync, còn tar thì
# luôn có. `--delete` của rsync được thay bằng `rm -rf` thư mục đích trước khi
# giải nén — cùng hiệu quả "đích khớp nguồn, không sót file cũ".
REMOTE_DIR="/tmp/dlp-chart-fresh"
echo "── ship chart tươi → ${VM_SSH}:${REMOTE_DIR}/platform"
tar -C "$(dirname "$CHART_SRC")" -cf - "$(basename "$CHART_SRC")" \
  | ssh "$VM_SSH" "rm -rf '${REMOTE_DIR}' && mkdir -p '${REMOTE_DIR}' && tar -C '${REMOTE_DIR}' -xf -"

# ─────────────────────────────────────────────────────────────────────────────
# Overlay VM-only, LỌC THEO DANH SÁCH CHO PHÉP. Đọc và giữ NGUYÊN trên VM.
#
# ⛔ BẢN ĐẦU CỦA BƯỚC NÀY LÀ MỘT CÁI BẪY — và nó đã cắn (P3/3.I mắt 2).
#
# Nó lấy TOÀN BỘ `helm get values` (mọi giá trị user-supplied của lần cài trước)
# rồi áp SAU `values-selfhost.yaml`. Nghĩa là mọi `--set` từng gõ một lần sẽ
# sống mãi và ĐÈ LÊN git: đo được ngày 2026-08-15, overlay 110 dòng đang ghim
# `image.tag: sha-25cb824`, `gateway.image.tag: 3h-drain2`,
# `orchestrator.image.tag: 3i-m1`, `orchestrator.env.sandboxImage: …3i-m1` —
# ba tag tay từ ba lượt đo khác nhau. Sửa tag trong values-selfhost rồi deploy
# thì `helm upgrade` báo THÀNH CÔNG, `rollout status` XANH, pod `Running 1/1`,
# và image vẫn y nguyên bản cũ. Không có gì đỏ lên. Đây đúng là lớp lỗi mà
# script 11-sideload + chính script này được dựng ra để diệt, chỉ đổi chỗ nấp:
# từ "chart cũ trên VM" sang "values cũ trong release".
#
# LUẬT: **git sở hữu mọi thứ git khai. VM chỉ cấp thứ git CỐ Ý không khai.**
# `values-selfhost.yaml` khai: global, image, web, orchestrator, gateway,
# datastore, sandbox, registryMirror. Nên chỉ những thứ dưới đây được mang sang:
#
#   · bí mật — không bao giờ vào git (mật khẩu PG/Redis, betterAuthSecret)
#   · giá trị phụ thuộc MÁY — IP/NodePort của node, khác nhau ở mỗi lab, nên
#     `ingress.*`, `networkPolicy.*`, `platform.*` (git không khai khối nào
#     trong ba khối này) + mấy leaf `web.env.*` do 08-tls-entrypoint.sh sinh.
#
# Danh sách CHO PHÉP chứ không phải danh sách CẤM: một key mới ai đó `--set`
# trong tương lai sẽ bị BỎ (git thắng), thay vì lặng lẽ sống mãi.
#
# Lọc bằng `-o json` + python3 stdlib: VM không có yq, cũng không có pyyaml.
# JSON là YAML hợp lệ nên helm nhận thẳng bằng `-f`.
# ─────────────────────────────────────────────────────────────────────────────
echo "── trích VM-only values (bí mật + phụ thuộc máy) → overlay tạm trên VM"
ssh "$VM_SSH" "helm get values '${RELEASE}' -n '${NAMESPACE}' -o json 2>/dev/null > ${REMOTE_DIR}/live-all.json" \
  || loi "không đọc được values live — release ${RELEASE} đã cài chưa?"

ssh "$VM_SSH" "python3 - ${REMOTE_DIR}/live-all.json ${REMOTE_DIR}/live-values.json" <<'PYFILTER'
import json, sys

src, dst = sys.argv[1], sys.argv[2]
with open(src) as f:
    live = json.load(f) or {}

# Khối git KHÔNG khai trong values-selfhost.yaml ⇒ mang nguyên khối.
KEEP_SUBTREES = ['ingress', 'networkPolicy', 'platform']
# Leaf nằm TRONG khối git có khai ⇒ chỉ mang đúng leaf, không mang cả khối.
KEEP_PATHS = [
    ['datastore', 'postgres', 'password'],
    ['datastore', 'redis', 'password'],
    ['datastore', 'existingSecret'],
    ['web', 'env', 'betterAuthSecret'],
    ['web', 'env', 'existingSecret'],
    ['web', 'env', 'betterAuthUrl'],
    ['web', 'env', 'corsAllowedOrigins'],
    ['web', 'env', 'rateLimitTrustProxy'],
]

out = {}
for k in KEEP_SUBTREES:
    if k in live:
        out[k] = live[k]

def dig(d, path):
    for p in path:
        if not isinstance(d, dict) or p not in d:
            return None
        d = d[p]
    return d

for path in KEEP_PATHS:
    v = dig(live, path)
    if v is None:
        continue
    node = out
    for p in path[:-1]:
        node = node.setdefault(p, {})
    node[path[-1]] = v

# Cổng chống REGENERATE bí mật: thiếu một trong ba thì DỪNG. Deploy tiếp sẽ
# sinh mật khẩu mới trong khi Postgres/Redis vẫn giữ mật khẩu cũ ⇒ mọi thứ đỏ,
# và triệu chứng (auth failed) nằm cách nguyên nhân rất xa.
missing = []
if dig(out, ['datastore', 'postgres', 'password']) is None and dig(out, ['datastore', 'existingSecret']) is None:
    missing.append('datastore.postgres.password')
if dig(out, ['datastore', 'redis', 'password']) is None and dig(out, ['datastore', 'existingSecret']) is None:
    missing.append('datastore.redis.password')
if dig(out, ['web', 'env', 'betterAuthSecret']) is None and dig(out, ['web', 'env', 'existingSecret']) is None:
    missing.append('web.env.betterAuthSecret')
if missing:
    sys.stderr.write('LỖI: không tìm thấy bí mật trong values live: %s\n' % ', '.join(missing))
    sys.stderr.write('Dừng để KHÔNG regenerate mật khẩu (Postgres/Redis vẫn giữ mật khẩu cũ).\n')
    sys.exit(1)

with open(dst, 'w') as f:
    json.dump(out, f, indent=2)

# In ra ĐƯỜNG DẪN KEY, tuyệt đối không in giá trị (đây là file chứa mật khẩu).
def paths(d, prefix=''):
    for k, v in sorted(d.items()):
        p = prefix + k
        if isinstance(v, dict):
            yield from paths(v, p + '.')
        else:
            yield p

print('   mang sang (%d key):' % len(list(paths(out))))
for p in paths(out):
    print('     · ' + p)
PYFILTER
[[ $? -eq 0 ]] || loi "lọc values live thất bại — xem thông báo ở trên"

ssh "$VM_SSH" "test -s ${REMOTE_DIR}/live-values.json" \
  || loi "overlay VM-only rỗng — dừng để KHÔNG regenerate mật khẩu (mọi RPC/DB sẽ đỏ)"

# Ship các overlay bổ sung.
REMOTE_EXTRA=()
for ov in "${EXTRA_OVERLAYS[@]:-}"; do
  [[ -n "$ov" ]] || continue
  [[ -f "${REPO_ROOT}/${ov}" || -f "$ov" ]] || loi "overlay không tồn tại: $ov"
  src="${ov}"; [[ -f "${REPO_ROOT}/${ov}" ]] && src="${REPO_ROOT}/${ov}"
  base="$(basename "$ov")"
  scp -q "$src" "${VM_SSH}:${REMOTE_DIR}/extra-${base}"
  REMOTE_EXTRA+=("-f ${REMOTE_DIR}/extra-${base}")
done

# ── CỔNG: mọi image chart RENDER ra phải CÓ TRÊN NODE ───────────────────────
#
# Cụm chạy `imagePullPolicy: Never` + side-load, nên một tag vắng mặt KHÔNG rơi
# về pull — nó thành `ErrImageNeverPull`. Và vì `platform-migrate` là pre-upgrade
# hook, một tag migrator sai làm HỎNG CẢ LƯỢT UPGRADE giữa chừng.
#
# ⛔ SỰ CỐ THẬT 2026-09-04 (P12/12.A) — cổng này sinh ra từ đó. `values-selfhost`
# ghim `image.tag: sha-2b79fd3` (từ P5) trong khi P7/P9/P10 đã deploy `p7`/`p9`/
# `p10a` bằng đường ngoài helm. `helm get values` in ra ĐÚNG `sha-2b79fd3` —
# trùng repo, nên mọi lệnh helm đều xanh; chỗ lệch nằm ở `spec.template…image`
# của Deployment, chỗ không lệnh helm nào so. Lượt upgrade kế tiếp lẽ ra hạ web
# + orchestrator + mọi pod sandbox mới xuống một tag không tồn tại; thứ duy nhất
# chặn được là hook migrate chết trước. Nền tảng sống nhờ một Job hỏng.
#
# Cổng so RENDER (thứ helm sắp áp) với `ctr images ls` (thứ node thật có) — hai
# nguồn độc lập. So render-với-live thì không phát hiện được gì: cả hai cùng sai.
echo "── cổng: đối chiếu image chart render ra với image có trên node"
RENDERED_IMAGES="$(ssh "$VM_SSH" "helm template '${RELEASE}' '${REMOTE_DIR}/platform' -n '${NAMESPACE}' \
    -f '${REMOTE_DIR}/platform/${SELFHOST_VALUES}' \
    -f '${REMOTE_DIR}/live-values.json' \
    ${REMOTE_EXTRA[*]:-} 2>/dev/null \
  | grep -oE '${IMAGE_REGISTRY_RE:-ghcr\.io/[a-z0-9._-]+}/[a-z0-9._-]+:[A-Za-z0-9._-]+' | sort -u")"
[[ -n "$RENDERED_IMAGES" ]] \
  || loi "cổng image: render ra 0 image — nhiều khả năng template lỗi, KHÔNG phải 'không có image'"

ON_NODE="$(ssh "$VM_SSH" "sudo ctr -n k8s.io images ls -q 2>/dev/null | sort -u")"
[[ -n "$ON_NODE" ]] \
  || loi "cổng image: 'ctr images ls' trả rỗng — không đọc được node, đừng đọc thành 'node trống'"

MISSING=""
while IFS= read -r img; do
  [[ -n "$img" ]] || continue
  grep -qxF "$img" <<<"$ON_NODE" || MISSING+="     · ${img}"$'\n'
done <<<"$RENDERED_IMAGES"

if [[ -n "$MISSING" ]]; then
  echo "   image chart sẽ áp nhưng KHÔNG có trên node:" >&2
  printf '%s' "$MISSING" >&2
  echo "   có trên node (dlp-*):" >&2
  grep -E 'dlp-' <<<"$ON_NODE" | sed 's/^/     · /' >&2
  loi "cổng image: dừng TRƯỚC upgrade. Side-load tag còn thiếu (infra/host/11-sideload-images.sh) HOẶC sửa tag trong values-selfhost.yaml. Áp tiếp là tự hạ nền tảng xuống tag không tồn tại."
fi
echo "   OK — $(wc -l <<<"$RENDERED_IMAGES") image render ra, tất cả đều có trên node"

echo "── helm upgrade từ chart tươi (values-selfhost → VM-only → overlay bổ sung)"
ssh "$VM_SSH" "helm upgrade '${RELEASE}' '${REMOTE_DIR}/platform' -n '${NAMESPACE}' \
    -f '${REMOTE_DIR}/platform/${SELFHOST_VALUES}' \
    -f '${REMOTE_DIR}/live-values.json' \
    ${REMOTE_EXTRA[*]:-} --wait --timeout 5m"

# Dọn bẫy: nếu ~/dlp-deploy còn tồn tại (bản chép tay cũ), thay bằng một tấm
# biển chỉ đường thay vì để nó tiếp tục là nguồn sự thật giả.
ssh "$VM_SSH" "if [ -d ~/dlp-deploy ]; then
  rm -rf ~/dlp-deploy;
  mkdir -p ~/dlp-deploy;
  printf 'ĐÃ BỎ. Deploy bằng infra/host/12-helm-deploy.sh (ship chart TƯƠI từ repo).\nBản chép tay ở đây từng LỆCH commit và làm helm upgrade gỡ mất tính năng.\n' > ~/dlp-deploy/README-DEPRECATED.txt;
fi"

# ── Cổng smoke (P5 / 5.E) ────────────────────────────────────────────────────
#
# ⛔ `helm upgrade --wait` chỉ nói "pod Ready", và lịch sử dự án có BA lần mọi
# thứ Ready trong khi hệ không phục vụ được ai (tag không ghim → service về bản
# cũ · quên side-load sandbox-base → pool rỗng · web xanh mà biên chưa phục vụ).
# Không có cổng này thì script kết thúc bằng chữ "Xong" ở đúng những lượt đó.
#
# Cổng chạy SAU khi upgrade xong và LÀM HỎNG mã thoát của script khi nó đỏ —
# một cổng chỉ in cảnh báo là một cổng bị bỏ qua.
if [ "$RUN_SMOKE" = 1 ]; then
  echo
  VM_SSH="$VM_SSH" RELEASE="$RELEASE" NAMESPACE="$NAMESPACE" \
    bash "$(dirname "${BASH_SOURCE[0]}")/13-smoke.sh"
else
  echo
  echo "(bỏ qua cổng smoke theo --no-smoke — deploy CHƯA được chứng minh là phục vụ được)"
fi

echo
echo "Xong. Chart deploy TỪ repo, không từ bản chép cũ. ~/dlp-deploy đã bị vô hiệu hoá."

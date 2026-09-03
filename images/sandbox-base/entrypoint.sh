#!/bin/bash
# images/sandbox-base/entrypoint.sh — P1, chặng 1.E-2 (E8).
#
# Hai việc, theo đúng thứ tự này, rồi `exec "$@"`:
#   1. dockerd nền (E7) — chỉ khi image được build với INCLUDE_DOCKER=1.
#   2. Nạp dotfiles của người dùng từ /mnt/dotfiles (read-only) qua allowlist.
#
# ── VÌ SAO KẾT BẰNG `exec` VÀ KHÔNG BAO GIỜ ĐƯỢC BỎ ──────────────────────────
# Cây tiến trình đích: tini(PID 1) → sleep infinity. `exec "$@"` THAY THẾ shell
# này bằng CMD nên không có tầng bash nào sống mãi ở giữa. Bỏ `exec` là thêm một
# tiến trình bash làm cha của CMD, mà bash đó KHÔNG forward tín hiệu — SIGTERM
# của `kubectl delete pod` dừng ở nó, pod nằm `Terminating` hết grace 30s và giữ
# 1 trong 4 khe quota (D16). Đúng cái hồi quy mà khối ENTRYPOINT của Dockerfile
# đã mô tả cho `sleep` trần; ở đây nó quay lại qua một cửa khác.
#
# ── VÌ SAO KHÔNG `set -e` Ở PHẦN DOTFILES ────────────────────────────────────
# Một bundle dotfiles hỏng (quá cap, toàn file bị từ chối, mount rỗng) KHÔNG
# được phép giết pod: pod chết trong warm-pool là `pool:free` đếm một xác, và
# sinh viên claim trúng nó. Nên mọi lỗi ở nhánh dotfiles đều là **cảnh báo có
# log** rồi đi tiếp — không im lặng, cũng không fatal.
set -uo pipefail

DOTFILES_SRC="${DLP_DOTFILES_SRC:-/mnt/dotfiles}"
DOTFILES_MAX_BYTES="${DLP_DOTFILES_MAX_BYTES:-262144}"   # 256 KiB
DOTFILES_MAX_FILES="${DLP_DOTFILES_MAX_FILES:-50}"

log()  { printf '[dlp-entrypoint] %s\n' "$*" >&2; }
warn() { printf '[dlp-entrypoint][WARN] %s\n' "$*" >&2; }

# ─────────────────────────────────────────────────────────────────────────────
# Allowlist. Trả 0 = cho phép.
#
# Tách thành HÀM RIÊNG có chủ ý: nó là vế bảo mật của E8, và một vế bảo mật
# không gọi được trực tiếp thì không kiểm được trực tiếp. `--lib-only` ở cuối
# file cho CI source đúng hàm này rồi bắn ca `../` vào — vector duy nhất khác
# để tạo `..` qua một thư mục mount là symlink, mà symlink đã bị chặn ở tầng
# trên, nên nếu không gọi được hàm thì guard `..` sẽ VĨNH VIỄN không có ca kiểm.
dlp_dotfile_allowed() {
    local rel="$1"

    # Path tuyệt đối — từ chối. (`find` cho ra đường tương đối, nên ca này chỉ
    # tới được từ đường archive tương lai; giữ vì nó rẻ và fail-closed.)
    case "$rel" in
        /*) return 1 ;;
    esac

    # Bất kỳ SEGMENT nào là `..` — từ chối. Bọc hai đầu bằng `/` rồi tìm `/../`
    # để phép kiểm nói đúng về segment chứ không phải về chuỗi con: `a/../etc`
    # thành `/a/../etc/` (khớp, chặn), còn tên file hợp lệ `.zshrc..bak` thành
    # `/.zshrc..bak/` (không khớp, cho qua). Dùng `*..*` là chặn cả tên vô hại
    # mà vẫn không nói được gì thêm về traversal.
    case "/$rel/" in
        */../*) return 1 ;;
    esac

    case "$rel" in
        .zshrc|.bashrc|.gitconfig|.tmux.conf) return 0 ;;
        .config/*)                            return 0 ;;
        *)                                    return 1 ;;
    esac
}

# ─────────────────────────────────────────────────────────────────────────────
# P3/3.I — mirror docker.io trong cụm.
#
# Ghi `/etc/docker/daemon.json` TỪ env `DLP_REGISTRY_MIRROR` (URL mirror trong
# cụm, vd `http://…-registry-mirror.dlp-registry.svc.cluster.local:5000`).
#
# ⚠ PHẢI CHẠY TRƯỚC start_dockerd. dockerd đọc daemon.json DUY NHẤT lúc khởi
# động; ghi sau khi dockerd đã lên thì mirror không có tác dụng mà KHÔNG lỗi nào
# — `docker pull` vẫn đi thẳng registry-1.docker.io rồi chết vì egress chặn, và
# triệu chứng đó không trỏ về đây.
#
# RỖNG = KHÔNG ghi gì (return 0). Đó là hành vi mặc định của mọi build hiện có
# và của test CI chạy dockerd ngoài Sysbox — không hồi quy.
#
# `insecure-registries` LÀ BẮT BUỘC cùng `registry-mirrors` khi mirror chạy
# HTTP: dockerd TỪ CHỐI một registry-mirror http nếu host không nằm trong
# insecure-registries (nó mặc định đòi https). Mạng cụm đã cô lập (luật 10) nên
# http nội cụm là đánh đổi có chủ ý — xem D-I6 trong plan.
write_docker_daemon_json() {
    local mirror="${DLP_REGISTRY_MIRROR:-}"
    [ -n "$mirror" ] || return 0

    # dockerd không có ⇒ ghi file cũng vô nghĩa. Không cảnh báo: build slim
    # (INCLUDE_DOCKER=0) mà nhận env mirror là cấu hình dư, không phải lỗi.
    command -v dockerd >/dev/null 2>&1 || return 0

    # host:port cho insecure-registries = URL bỏ scheme. dockerd muốn dạng
    # host[:port] KHÔNG có `http://`.
    local host="$mirror"
    host="${host#http://}"
    host="${host#https://}"
    host="${host%%/*}"

    if ! mkdir -p /etc/docker; then
        warn "không tạo được /etc/docker — bỏ qua cấu hình mirror, docker sẽ đi thẳng docker.io (rồi chặn bởi egress)"
        return 0
    fi

    cat > /etc/docker/daemon.json <<EOF
{
  "registry-mirrors": ["${mirror}"],
  "insecure-registries": ["${host}"]
}
EOF
    log "docker: mirror ${mirror} ghi vào /etc/docker/daemon.json (insecure host ${host})"
}

# ─────────────────────────────────────────────────────────────────────────────
# E7 — dockerd.
#
# Gác bằng `command -v`: build INCLUDE_DOCKER=0 KHÔNG được vỡ vì entrypoint đi
# tìm một binary không có. Một entrypoint chỉ chạy đúng với một tổ hợp build-arg
# là một quả mìn hẹn giờ cho lần đầu ai đó build bản slim.
#
# KHÔNG chờ socket sẵn sàng: pod warm-pool sống hàng phút trước khi có người
# claim, nên dockerd đã lên từ lâu ở đường nóng. Chỉ đường cold-path (pool rỗng)
# mới có thể gõ `docker` trong vài giây đầu — đánh đổi có chủ ý, đã đo trên
# cluster và ghi số vào report của chặng.
start_dockerd() {
    if ! command -v dockerd >/dev/null 2>&1; then
        return 0
    fi
    if ! mkdir -p /var/log/dlp; then
        warn "không tạo được /var/log/dlp — dockerd sẽ không khởi động"
        return 0
    fi
    # Sysbox lo phần khó (user-ns, /var/lib/docker, overlay2) nên KHÔNG ép
    # --storage-driver ở đây: ghim sai driver là dockerd chết lúc khởi động với
    # một thông báo trỏ vào kernel chứ không trỏ vào dòng này.
    dockerd >>/var/log/dlp/dockerd.log 2>&1 &
    local pid=$!
    # `&` LUÔN thành công dưới góc nhìn của shell cha, nên in "đã khởi động"
    # ngay sau nó là một lời khẳng định không dựa trên gì. Chờ một nhịp rồi
    # `kill -0` để câu log nói đúng thứ nó biết. Không có nhịp này thì ca
    # dockerd chết ngay lúc exec (rootfs read-only, thiếu iptables, cgroup lạ)
    # vẫn cho ra dòng "đã khởi động nền" — và người vận hành sẽ tin nó.
    sleep 0.3
    if kill -0 "$pid" 2>/dev/null; then
        log "dockerd đã khởi động nền (log: /var/log/dlp/dockerd.log)"
    else
        warn "dockerd KHÔNG lên được. Mọi lệnh docker sẽ trả 'Cannot connect to the Docker daemon'. 20 dòng cuối của log:"
        # Đổ log ra STDERR chỉ ở nhánh HỎNG. Log của dockerd nằm trong file bên
        # trong pod, nên `kubectl logs` không thấy gì — người vận hành sẽ thấy
        # pod Running, dashboard xanh, tính năng chết, và phải exec vào pod rồi
        # biết trước đường dẫn mới chẩn đoán được. Đổ ở nhánh hỏng cho
        # `kubectl logs` lý do thật mà không làm ngập log ở đường bình thường.
        tail -n 20 /var/log/dlp/dockerd.log >&2 2>/dev/null || true
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# 6.B/6.C — Theia (IDE), CHỈ nghe loopback.
#
# Gác bằng đường dẫn chứ không bằng `command -v`, vì `node` được chép vào
# /opt/theia/node/bin chứ không lên PATH: build INCLUDE_IDE=0 KHÔNG được vỡ vì
# entrypoint đi tìm một thư mục không có — cùng lý do start_dockerd gác bằng
# `command -v` (một entrypoint chỉ chạy đúng với một tổ hợp build-arg là quả mìn
# hẹn giờ cho lần đầu ai đó build bản slim).
#
# ⛔ `--hostname=0.0.0.0` LÀ MỘT ĐÁNH ĐỔI ĐÃ CÂN, không phải mặc định tiện tay.
#
# Bản đầu của 6.C ghim `127.0.0.1` cho chặt. Nhưng gateway và sandbox là HAI
# network namespace: `127.0.0.1` của pod sandbox không tồn tại với gateway, nên
# ghim loopback là buộc mọi byte của IDE (tải file, WS, autocomplete) phải đi qua
# `portforward` của apiserver. Trên cụm này apiserver đã restart 41 lần và cả
# cụm là 8 vCPU — đặt IDE lên đường đó là mua một lớp phòng thủ bằng một điểm
# hỏng duy nhất cho MỌI phiên cùng lúc. Chốt 2026-09-04: nghe podIP, gateway nối
# thẳng.
#
# AI ĐANG GÁNH PHẦN BẢO MẬT SAU QUYẾT ĐỊNH NÀY — cả ba, và không cái nào thừa:
#  1. NetworkPolicy default-deny trong namespace sandbox: pod sandbox KHÔNG chạm
#     được pod sandbox khác. Đây là lớp thật sự cô lập người học với người học.
#  2. Rule `sandbox-allow-ingress-gateway`: chỉ pod gateway của release này vào
#     được. Rule đó đã có từ P1 và comment của nó ghi sẵn "giữ cho hướng tương
#     lai gateway nối trực tiếp TCP/WS" — hướng đó là đây.
#  3. Chuỗi authz a/c–h trong `internal/sessionauth`: gateway chỉ proxy tới pod
#     của CHÍNH chủ token.
#
# ⚠ Điều KHÔNG còn đúng nữa: một pod bất kỳ chạm được podIP:4000 sẽ gặp một
# Theia KHÔNG xác thực. Lớp (1) là thứ duy nhất chặn điều đó, nên NetworkPolicy
# của namespace sandbox từ nay là hạ tầng THIẾT YẾU, không phải phòng thủ chiều
# sâu. Tắt Calico enforcement là mở toang IDE của mọi người học.
#
# Workspace mặc định là $HOME của pod, KHÔNG phải một thư mục riêng: ô AC của
# phase-6 đòi "sửa file trong editor, `cat` trong terminal thấy nội dung mới —
# CÙNG filesystem, không phải hai bản sao". Trỏ Theia vào chỗ khác là tự tay
# dựng bản sao thứ hai.
DLP_IDE_PORT="${DLP_IDE_PORT:-4000}"

start_theia() {
    [ -x /opt/theia/node/bin/node ] || return 0

    local main=/opt/theia/applications/browser/lib/backend/main.js
    if [ ! -f "$main" ]; then
        warn "/opt/theia có node nhưng thiếu $main — image IDE dựng hỏng, bỏ qua"
        return 0
    fi
    if ! mkdir -p /var/log/dlp; then
        warn "không tạo được /var/log/dlp — Theia sẽ không khởi động"
        return 0
    fi

    /opt/theia/node/bin/node "$main" "${HOME:-/root}"         --hostname=0.0.0.0 --port="$DLP_IDE_PORT"         >>/var/log/dlp/theia.log 2>&1 &
    local pid=$!
    # Cùng lý do như dockerd: `&` luôn thành công dưới góc nhìn shell cha, nên
    # in "đã khởi động" ngay sau nó là khẳng định không dựa trên gì. Theia mất
    # ~2s tới lúc trả HTTP (đo 6.A: 1916ms) nên nhịp chờ dài hơn của dockerd —
    # nhưng đây CHỈ kiểm tiến trình còn sống, KHÔNG kiểm nó phục vụ được. Muốn
    # biết "dùng được chưa" thì phải hỏi cổng, và đó là việc của 6.C.
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
        log "Theia đã khởi động nền trên 0.0.0.0:$DLP_IDE_PORT (log: /var/log/dlp/theia.log)"
    else
        warn "Theia KHÔNG lên được. Route IDE sẽ trả 502. 20 dòng cuối của log:"
        tail -n 20 /var/log/dlp/theia.log >&2 2>/dev/null || true
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# E8 — nạp dotfiles.
load_dotfiles() {
    [ -d "$DOTFILES_SRC" ] || return 0

    local home="${HOME:-/root}"
    local root="$DOTFILES_SRC"
    local total=0 count=0 copied=0 rejected=0

    # ── Layout atomic-writer của kubelet ────────────────────────────────────
    # ConfigMap / Secret / projected KHÔNG được kubelet ghi thẳng vào thư mục
    # mount. Nó dựng:
    #     /mnt/dotfiles/..2026_08_12_04_34_54.123/.zshrc   ← file THẬT duy nhất
    #     /mnt/dotfiles/..data  → ..2026_08_12_04_34_54.123      (symlink)
    #     /mnt/dotfiles/.zshrc  → ..data/.zshrc                  (symlink)
    # Không xử lý thì `find -type f` cho `rel` = `..2026_…/.zshrc` (lọt guard
    # `..` vì segment đó KHÔNG phải `..`, rồi chết ở allowlist), còn mọi tên
    # người dùng thấy đều là symlink nên bị lượt `-type l` gạt ⇒ **chép 0 file**
    # với log trỏ vào "allowlist", tức dẫn người debug đi sai hướng hoàn toàn.
    #
    # `..data` do KUBELET dựng, không phải người dùng, nên đi theo nó là an
    # toàn — và đây là chỗ DUY NHẤT trong file này cố ý đi theo một symlink.
    if [ -L "$root/..data" ]; then
        local resolved
        if resolved=$(readlink -f "$root/..data") && [ -d "$resolved" ]; then
            log "dotfiles: phát hiện layout atomic-writer của kubelet, quét $resolved"
            root="$resolved"
        else
            warn "dotfiles: có ..data nhưng không giải được — bỏ qua toàn bộ"
            return 0
        fi
    fi

    # ── $HOME không được chứa symlink ──────────────────────────────────────
    # `rm -f "$dest"` ở dưới chỉ bảo vệ thành phần CUỐI. `mkdir -p` và `cp` vẫn
    # đi XUYÊN qua symlink ở mọi thành phần CHA, nên một `$HOME/.config` là
    # symlink sẽ đẩy mọi file `.config/**` ra ngoài $HOME — trong khi toàn bộ
    # test tên-file vẫn xanh. Hôm nay $HOME chỉ có 3 file thường chép từ
    # /etc/skel lúc build, nhưng đó là bất biến của một FILE KHÁC (Dockerfile);
    # khối này biến nó thành thứ đo được ngay tại đây.
    local bad_link
    bad_link=$(find "$home" -maxdepth 3 -type l -print -quit 2>/dev/null)
    if [ -n "$bad_link" ]; then
        warn "dotfiles BỊ BỎ QUA TOÀN BỘ: \$HOME chứa symlink ($bad_link) — cp/mkdir sẽ ghi XUYÊN qua nó ra ngoài \$HOME"
        return 0
    fi

    # stderr của `find` đi vào file rồi được NÓI RA, không bị nuốt: một thư mục
    # con không đọc được (permission, I/O) làm file biến mất mà không dòng log
    # nào — đúng lớp lỗi mà lượt quét `-type l` bên dưới được thêm vào để sửa.
    local ferr
    ferr=$(mktemp) || ferr=/dev/null

    # Symlink bị `-type f` ở dưới loại ÂM THẦM — nó không bao giờ vào vòng lặp,
    # nên không có dòng log nào. Quét riêng một lượt `-type l` chỉ để NÓI ra.
    # Không có khối này thì một `.gitconfig` symlink của người dùng biến mất
    # không dấu vết: bảo mật thì đúng, nhưng người dùng không có cách nào biết
    # vì sao cấu hình của mình không có tác dụng — đó là im lặng, không phải an
    # toàn. (Phát hiện khi đo ca fixture 2026-08-12: `rejected=2`, không phải 3.)
    local link
    while IFS= read -r -d '' link; do
        warn "từ chối (là symlink, không đi theo): ${link#"$root"/}"
        rejected=$((rejected + 1))
    done < <(find "$root" -type l -print0 2>>"$ferr")

    # `find` KHÔNG có -L: symlink hiện ra là `-type l` nên `-type f` loại nó, và
    # find cũng không đi XUỐNG một thư mục symlink. Đó là thứ chặn cả hai vector
    # thoát ra ngoài $HOME (file symlink trỏ /etc/passwd, và thư mục symlink trỏ
    # /). Đừng thêm -L "cho tiện" — nó mở lại cả hai cùng lúc.
    while IFS= read -r -d '' src; do
        local rel="${src#"$root"/}"
        if ! dlp_dotfile_allowed "$rel"; then
            warn "từ chối (ngoài allowlist / traversal): $rel"
            rejected=$((rejected + 1))
            continue
        fi
        local sz
        sz=$(stat -c %s "$src" 2>/dev/null) || sz=0
        total=$((total + sz))
        count=$((count + 1))
    done < <(find "$root" -type f -print0 2>>"$ferr")

    if [ -s "$ferr" ]; then
        warn "find báo lỗi khi quét (file có thể đã bị bỏ sót): $(tr '\n' ' ' < "$ferr")"
    fi
    [ "$ferr" = /dev/null ] || rm -f "$ferr"

    if [ "$count" -eq 0 ]; then
        log "dotfiles: không có file nào hợp lệ ($rejected bị từ chối)"
        return 0
    fi

    # Cap kiểm TRƯỚC khi chép một byte nào, và vỡ cap thì bỏ TOÀN BỘ bundle.
    # Chép tới đâu hay tới đó rồi dừng giữa chừng cho ra một $HOME nửa vời —
    # trạng thái đó khó chẩn đoán hơn hẳn "không nạp gì cả, có lý do trong log".
    if [ "$count" -gt "$DOTFILES_MAX_FILES" ]; then
        warn "dotfiles BỊ BỎ QUA TOÀN BỘ: $count file > cap $DOTFILES_MAX_FILES"
        return 0
    fi
    if [ "$total" -gt "$DOTFILES_MAX_BYTES" ]; then
        warn "dotfiles BỊ BỎ QUA TOÀN BỘ: $total byte > cap $DOTFILES_MAX_BYTES"
        return 0
    fi

    local written=0
    while IFS= read -r -d '' src; do
        local rel="${src#"$root"/}"
        dlp_dotfile_allowed "$rel" || continue
        local dest="$home/$rel"
        mkdir -p "$(dirname "$dest")" || { warn "không tạo được thư mục cho $rel"; continue; }
        # `rm -f` TRƯỚC `cp`: nếu $HOME/<rel> đang là symlink thì `cp` sẽ ghi
        # XUYÊN qua nó ra ngoài $HOME. Xoá trước biến ca đó thành ghi đè một
        # file thường. (Thành phần CHA do khối quét symlink ở đầu hàm gác.)
        rm -f "$dest"
        if cp -- "$src" "$dest"; then
            copied=$((copied + 1))
            written=$((written + $(stat -c %s "$dest" 2>/dev/null || echo 0)))
        else
            warn "chép thất bại: $rel"
        fi
    done < <(find "$root" -type f -print0 2>/dev/null)

    # Đếm byte ĐÃ GHI, không phải byte ứng viên. Bản trước in `$total` nên ca
    # "$HOME không ghi được" cho ra dòng tự mâu thuẫn: `chép 0 file (5 byte)`.
    log "dotfiles: chép $copied file ($written byte ghi ra / $total byte ứng viên), từ chối $rejected"
}

# ─────────────────────────────────────────────────────────────────────────────
# `--lib-only`: chỉ nạp hàm, không chạy gì. Dành cho ca kiểm của CI.
if [ "${1:-}" = "--lib-only" ]; then
    # shellcheck disable=SC2317  # `exit 0` KHÔNG unreachable: `return` ở top-level
    # chỉ hợp lệ khi script được SOURCE. Khi bị chạy trực tiếp thì `return` hỏng và
    # nhánh `|| exit 0` mới là nhánh chạy. shellcheck chỉ thấy đường sourced.
    return 0 2>/dev/null || exit 0
fi

write_docker_daemon_json
start_dockerd
start_theia
load_dotfiles

# `set -u` KHÔNG bắt `"$@"` rỗng (bash miễn trừ hai special param `$@`/`$*` từ
# 4.4), nên `exec "$@"` với 0 tham số KHÔNG exec gì cả — script chạy hết và trả
# 0. Đo được 2026-08-12: `docker run --entrypoint /usr/local/bin/dlp-entrypoint.sh IMG`
# → rc=0, tức tini thoát, tức pod về **Succeeded** và warm-pool đầy xác mà
# `pool:free` vẫn đếm là ấm — đúng hồi quy mà cả khối header của file này tồn
# tại để chặn.
#
# Bất biến đó trước đây được giữ bởi một file KHÁC (`podspec.go` không đặt
# Command/Args) mà script này không nhìn thấy và không cổng nào khẳng định. Một
# dòng dưới đây biến nó thành thứ tự bảo vệ: default phải TRÙNG với `CMD` của
# Dockerfile.
[ "$#" -gt 0 ] || set -- sleep infinity

exec "$@"

# images/sandbox-base — image chạy trong pod lab (P1, chặng 1.E-1: E1–E5 + E10).
#
# Nền Ubuntu, không phải Debian: host chạy Debian 13 (design §5b) nhưng phần lớn
# tài liệu DevOps/KillerCoda giả định `apt` trên Ubuntu — host Debian chạy
# container Ubuntu là chuyện bình thường, không phải nghịch lý.
#
# ── VÌ SAO 24.04 (Noble Numbat), không phải 26.04 và cũng không phải 22.04 ────
# Đo trực tiếp bằng `apt-cache policy` trên cả ba base (2026-08-10):
#
#   base    image   eza       fastfetch  zoxide   bat     tmux    hết hỗ trợ
#   22.04   119 MB  THIẾU     THIẾU      0.4.3    0.19    3.2a    2027-04
#   24.04   119 MB  0.18.2    THIẾU      0.9.3    0.24    3.4     2029-04
#   26.04   160 MB  0.23.4    2.57.1     0.9.8    0.25    3.6a    2031-04
#
# 24.04 nhẹ hơn 26.04 **41 MB** mà vẫn giữ được `eza` trong repo; 22.04 cùng cỡ
# 119 MB nhưng mất CẢ `eza` LẪN `fastfetch` và `zoxide` tụt về bản 2021, nên nó
# trả thêm hai món nợ để đổi lấy đúng 0 MB. `tmux 3.4` còn là **chính version mà
# D17 đo hành vi hai-client** — chạy đúng bản đã đo thì kết luận đó còn giá trị.
#
# ⚠ Kích thước image là ĐĨA, không phải RAM. Pod lab lúc rảnh chỉ tốn ~7.5 MB RSS
# (PID 1); RAM thật do zsh + tmux + oh-my-posh quyết định và như nhau trên cả ba
# base. Đừng chọn base vì lý do RAM.
#
# CHƯA CÓ Ở CHẶNG NÀY (E6–E9, xem README §"Chưa làm"): pwsh, docker/DinD,
# entrypoint nạp dotfiles. `INCLUDE_PWSH`/`INCLUDE_DOCKER` cố tình CHƯA khai báo
# — một ARG khai sẵn mà không có nhánh nào đọc là lời hứa suông, và CI truyền
# build-arg lạ vào thì buildx chỉ cảnh báo chứ không đỏ, nên nó sẽ im lặng vô
# nghĩa cho tới khi ai đó tin vào nó.
#
# `--platform=linux/amd64` GHIM CÓ CHỦ Ý: cả CI runner lẫn VM lab đều amd64, và
# hai binary tải thẳng ở dưới cũng là amd64. Không ghim thì build trên máy arm64
# (Apple Silicon) cho image **xanh nhưng hỏng âm thầm**: base thành arm64, binary
# vẫn là amd64, `sha256sum -c` VẪN KHỚP (nó kiểm đúng file nó tải, không kiểm
# arch), rồi trong pod mỗi lần mở shell là `exec format error` và prompt biến mất.
FROM --platform=linux/amd64 ubuntu:24.04

# ─────────────────────────────────────────────────────────────────────────────
# Hai binary tải thẳng — GHIM VERSION + SHA256.
#
# Tuyệt đối KHÔNG `curl … install.sh | bash`: script kiểu đó kéo `releases/latest`
# từ CDN, nên hai lần build cách nhau một ngày cho ra hai binary khác nhau và
# không có checksum nào để phát hiện.
#
# oh-my-posh: sha256 lấy từ `checksums.txt` CỦA CHÍNH RELEASE (nhà phát hành ký).
# fastfetch: release **không publish checksum nào** (đã kiểm — không có asset
#   sum/sha nào), nên con số dưới đây là digest của đúng artifact đã tải và kiểm
#   ngày 2026-08-10 (6.176.110 byte). Nó vẫn ghim build về một artifact bất biến
#   — nhưng phải đọc đúng bản chất: đây là trust-on-first-use, KHÔNG phải chữ ký
#   của nhà phát hành. Nâng version thì phải tính lại digest bằng tay.
ARG OMP_VERSION=v30.6.4
ARG OMP_SHA256=5477f9b110e4165676600630bf4e7b903ee5d176c004b29bdd6b5d64d3ef9074
ARG FASTFETCH_VERSION=2.67.0
ARG FASTFETCH_SHA256=d27b68638d49ae109294b47e7328b7868f5c5568e9cd2be83514eb0d674c863e

# ─────────────────────────────────────────────────────────────────────────────
# E1 — một layer apt duy nhất, xoá index trong CÙNG layer.
#
# `fastfetch` cài trong CHÍNH layer này (không tách RUN riêng) vì `apt-get install
# ./x.deb` cần apt index còn sống để giải dependency — tách ra là phải `apt-get
# update` lần hai, tức tải lại toàn bộ index cho một gói.
#
# BỐN gói ngoài danh sách E1 của plan, thêm có chủ ý:
#
#   ncurses-term — tmux `default-terminal tmux-256color` cần terminfo entry cùng
#     tên, mà entry đó nằm ở đây chứ không phải trong gói `tmux`. Thiếu nó thì
#     tmux chết ngay lúc khởi động ("missing or unsuitable terminal"), tức D3
#     (tmux là cơ chế reconnect) hỏng ở đúng đường mà G4 sẽ đi.
#
#   xxd — AC "Terminal UX" kiểm glyph *trong pod*; thiếu nó thì lệnh acceptance
#     chỉ chạy được sau khi chép byte ra ngoài, và đó là lúc người ta bỏ qua nó.
#
#   vim-tiny — cung cấp `/usr/bin/vi`. `.zshrc`/`.bashrc` đặt `EDITOR=vi`, mà
#     base Ubuntu KHÔNG có editor nào: thiếu gói này thì `git commit` (không -m)
#     chết với "cannot run vi", và trên một nền tảng DẠY DevOps thì không sửa
#     được YAML/Dockerfile nghĩa là không làm được bài — trong khi AC "10 binary"
#     vẫn xanh trọn vẹn. ~1.5 MB.
#
#   tini — PID 1 tử tế, xem khối ENTRYPOINT ở cuối file.
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        zsh \
        tmux \
        git \
        curl \
        ca-certificates \
        less \
        jq \
        unzip \
        locales \
        ncurses-term \
        xxd \
        vim-tiny \
        tini \
        fzf \
        bat \
        zoxide \
        eza && \
    # Ubuntu đóng gói bat với tên binary `batcat` (đụng tên với gói `bat` cũ của
    # ACPI). Alias trong shell là KHÔNG đủ — script và `$EDITOR`-style gọi `bat`
    # không đi qua alias — nên phải là symlink thật trên PATH.
    ln -sf /usr/bin/batcat /usr/local/bin/bat && \
    # fastfetch: KHÔNG có trong repo của 24.04 (chỉ 26.04 mới có). Cài từ .deb
    # ghim version + digest thay vì rơi về `neofetch` — neofetch đã archive từ
    # 2024, và dạy sinh viên một công cụ đã chết là món nợ trả bằng thời gian
    # của người khác.
    curl -fsSL -o /tmp/fastfetch.deb \
        "https://github.com/fastfetch-cli/fastfetch/releases/download/${FASTFETCH_VERSION}/fastfetch-linux-amd64.deb" && \
    echo "${FASTFETCH_SHA256}  /tmp/fastfetch.deb" | sha256sum -c - && \
    apt-get install -y --no-install-recommends /tmp/fastfetch.deb && \
    rm -f /tmp/fastfetch.deb && \
    rm -rf /var/lib/apt/lists/*

# ─────────────────────────────────────────────────────────────────────────────
# E2 — locale + màu.
#
# Thiếu COLORTERM là oh-my-posh tự rơi về 256 màu và AC "truecolor" đỏ DÙ
# terminal phía FE hoàn toàn đúng — lỗi kiểu đó rất tốn thời gian vì mọi thứ
# nhìn "gần đúng". Đặt ở tầng image để mọi đường vào (exec, tmux, zsh, bash)
# đều thấy, không phụ thuộc file rc nào được nạp.
RUN sed -i 's/^# *\(en_US\.UTF-8 UTF-8\)/\1/' /etc/locale.gen && \
    locale-gen en_US.UTF-8

ENV LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8 \
    TERM=xterm-256color \
    COLORTERM=truecolor

# ─────────────────────────────────────────────────────────────────────────────
# E3 — oh-my-posh.
#
# `sha256sum -c` đứng GIỮA tải và cài: sai checksum thì `install` không bao giờ
# chạy. Đặt verify sau khi cài là kiểm một thứ đã nằm trên PATH rồi.
RUN curl -fsSL -o /tmp/oh-my-posh \
        "https://github.com/JanDeDobbeleer/oh-my-posh/releases/download/${OMP_VERSION}/posh-linux-amd64" && \
    echo "${OMP_SHA256}  /tmp/oh-my-posh" | sha256sum -c - && \
    install -m 0755 /tmp/oh-my-posh /usr/local/bin/oh-my-posh && \
    rm -f /tmp/oh-my-posh

# ─────────────────────────────────────────────────────────────────────────────
# E3/E4 — theme là TÀI SẢN CỦA REPO, không phải asset tải về.
#
# `themes.zip` của release oh-my-posh KHÔNG có dòng nào trong `checksums.txt`
# (kiểm 2026-08-10: file chỉ liệt kê 10 binary), nên tải nó về là đúng cái "tải
# không checksum" mà E3 vừa cấm ở ngay trên. Theme nằm trong repo thì vừa ghim
# được vừa là thứ ta thật sự muốn kiểm soát — nó là quyết định thiết kế, không
# phải dependency.
COPY etc/dlp.omp.json /etc/dlp/dlp.omp.json

# ─────────────────────────────────────────────────────────────────────────────
# E4 — shell config dùng chung, vào /etc/skel VÀ $HOME.
#
# /etc/skel phục vụ user tạo sau; $HOME (root) phục vụ NGAY phiên này, vì pod
# sandbox chạy bằng root trong user-namespace của Sysbox (podspec.go CỐ Ý không
# đặt RunAsNonRoot — dockerd của E7 cần root đó). Chỉ chép vào skel thôi thì
# phiên đầu tiên vào bằng root sẽ không có prompt, không có alias, không có gì.
#
# ⚠ E8: từ đây /root là BẢN SAO, không phải symlink. Khi E8 thêm entrypoint nạp
# dotfiles của người dùng, nhớ /root đã có thể lệch khỏi /etc/skel.
COPY skel/ /etc/skel/
RUN cp -a /etc/skel/. /root/

# ─────────────────────────────────────────────────────────────────────────────
# E5 — CỐ Ý KHÔNG cài Nerd Font.
#
# Glyph được render ở TRÌNH DUYỆT, không ở container: font là tài sản của
# `packages/terminal` (F3, woff2 subset self-host vì CSP `font-src 'self'`).
# Cài TTF vào đây là ~50–100 MB hoàn toàn vô ích — image chỉ cần PHÁT đúng
# codepoint, và theme ở trên đã làm việc đó.

# ─────────────────────────────────────────────────────────────────────────────
# PID 1 phải SỐNG, và phải là một PID 1 TỬ TẾ.
#
# (a) Vì sao không để CMD thoát: `internal/k8s/podspec.go` KHÔNG đặt Command/Args
#     (pod chạy CMD của image) và đặt `RestartPolicy: Never`. Với
#     `CMD ["/bin/bash"]` của bản placeholder, bash không có TTY nên thoát NGAY,
#     pod về `Succeeded` và warm-pool đầy pod chết mà `pool:free` vẫn tính là ấm
#     — sinh viên claim trúng một xác. `pause` che kín chuyện này vì binary của
#     nó ngủ vĩnh viễn, nên lỗi chỉ lộ đúng vào lúc đổi sang image thật.
#
# (b) Vì sao `tini` chứ không phải `sleep infinity` trần. `sleep` là PID 1 tồi ở
#     hai điểm, và cả hai đều là HỒI QUY so với `pause` (pause làm đúng cả hai):
#       · Không reap: tmux tự daemonize nên tmux server bị reparent về PID 1;
#         `sleep` không bao giờ `wait()` ⇒ tiến trình chết thành zombie vĩnh viễn.
#         Hôm nay vô hại, nhưng E7 (dockerd + `docker build`) đẻ hàng loạt con và
#         zombie ăn thẳng vào pids-cgroup — đúng thứ mà D-19′ sắp đặt trần 4096.
#       · Nuốt SIGTERM: kernel chỉ chuyển tín hiệu cho PID 1 khi có handler tường
#         minh, mà `sleep` không cài ⇒ `kubectl delete pod` (grace mặc định 30s)
#         để pod nằm `Terminating` đủ 30 giây, giữ 1 trong 4 khe quota (D16).
#     `tini -- sleep infinity` reap con mồ côi và chuyển tín hiệu đúng cách.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sleep", "infinity"]

LABEL org.opencontainers.image.title="dlp-sandbox-base" \
      org.opencontainers.image.description="DevOps Learning Platform — sandbox base (P1 1.E-1, Ubuntu 24.04: zsh/tmux/oh-my-posh + CLI hiện đại; chưa có pwsh/DinD)" \
      org.opencontainers.image.source="https://github.com/Nghaiz/DevOps_Learning_Platform"
